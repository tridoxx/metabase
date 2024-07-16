import type { LocationDescriptor } from "history";
import { useCallback, useMemo, useState, memo, useEffect } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import {
  useGetCollectionQuery,
  useListBookmarksQuery,
  useReorderBookmarksMutation,
} from "metabase/api";
import { logout } from "metabase/auth/actions";
import CreateCollectionModal from "metabase/collections/containers/CreateCollectionModal";
import {
  currentUserPersonalCollections,
  nonPersonalOrArchivedCollection,
} from "metabase/collections/utils";
import Modal from "metabase/components/Modal";
import { getOrderedBookmarks } from "metabase/entities/bookmarks";
import type { CollectionTreeItem } from "metabase/entities/collections";
import Collections, {
  buildCollectionTree,
  getCollectionIcon,
  ROOT_COLLECTION,
} from "metabase/entities/collections";
import Databases from "metabase/entities/databases";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { addUndo } from "metabase/redux/undo";
import { getHasDataAccess, getHasOwnDatabase } from "metabase/selectors/data";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";
import type Database from "metabase-lib/v1/metadata/Database";
import type { Bookmark, Collection, User } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { NavbarErrorView } from "../NavbarErrorView";
import { NavbarLoadingView } from "../NavbarLoadingView";
import type { MainNavbarProps, SelectedItem } from "../types";

import MainNavbarView from "./MainNavbarView";

type NavbarModal = "MODAL_NEW_COLLECTION" | null;

function mapStateToProps(state: State, { databases = [] }: DatabaseProps) {
  return {
    currentUser: getUser(state),
    isAdmin: getUserIsAdmin(state),
    hasDataAccess: getHasDataAccess(databases),
    hasOwnDatabase: getHasOwnDatabase(databases),
    bookmarks: getOrderedBookmarks(state),
  };
}

const mapDispatchToProps = {
  logout,
};

interface Props extends MainNavbarProps {
  isAdmin: boolean;
  currentUser: User;
  selectedItems: SelectedItem[];
  bookmarks: Bookmark[];
  collections: Collection[];
  rootCollection: Collection;
  hasDataAccess: boolean;
  hasOwnDatabase: boolean;
  allError: boolean;
  allFetched: boolean;
  logout: () => void;
  onChangeLocation: (location: LocationDescriptor) => void;
}

interface DatabaseProps {
  databases?: Database[];
}

function MainNavbarContainer({
  isAdmin,
  selectedItems,
  isOpen,
  currentUser,
  hasOwnDatabase,
  collections = [],
  rootCollection,
  hasDataAccess,
  location,
  params,
  openNavbar,
  closeNavbar,
  logout,
  onChangeLocation,
  ...props
}: Props) {
  const [modal, setModal] = useState<NavbarModal>(null);

  const dispatch = useDispatch();

  // FIXME: Move bookmark code into hook
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const bookmarksResult = useListBookmarksQuery();
  const [reorderBookmarksInAPI] = useReorderBookmarksMutation();
  const reorderBookmarksInAPIWithDebouncing = _.debounce(
    reorderBookmarksInAPI,
    500,
  );

  const getAlphabetizedBookmarks = useCallback((bookmarks: Bookmark[]) => {
    const data =
      bookmarks?.map(bookmark => JSON.stringify([bookmark.name, bookmark])) ||
      [];
    data.sort();
    return data.join(",");
  }, []);

  // FIXME: I think we need to invalidate the RTK query for bookmarks whenever a collection moves into the trash

  // Update the bookmarks in the UI only if something other than the sort changes
  useEffect(
    () => {
      const bookmarksFromAPI = bookmarksResult.data || [];
      if (
        getAlphabetizedBookmarks(bookmarksFromAPI) !==
        getAlphabetizedBookmarks(bookmarks)
      ) {
        setBookmarks(bookmarksFromAPI);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookmarksResult.data, bookmarks],
  );

  /** Update the bookmark order optimistically in the UI, then send the new order to the API */
  const updateBookmarkOrder = useCallback(
    async (newBookmarks: Bookmark[]) => {
      setBookmarks(newBookmarks);
      const orderings = newBookmarks.map(({ type, item_id }) => ({
        type,
        item_id,
      }));
      await reorderBookmarksInAPIWithDebouncing({ orderings })
        ?.unwrap()
        .catch(async () => {
          await dispatch(
            addUndo({
              icon: "warning",
              toastColor: "error",
              message: t`An error occurred.`,
            }),
          );
        });
    },
    [reorderBookmarksInAPIWithDebouncing, dispatch],
  );

  const reorderBookmarks = useCallback(
    ({ newIndex, oldIndex }: { newIndex: number; oldIndex: number }) => {
      const newBookmarks = [...bookmarks];
      const movedBookmark = newBookmarks[oldIndex];
      newBookmarks.splice(oldIndex, 1);
      newBookmarks.splice(newIndex, 0, movedBookmark);
      updateBookmarkOrder(newBookmarks);
    },
    [bookmarks, updateBookmarkOrder],
  );

  const {
    data: trashCollection,
    isLoading,
    error,
  } = useGetCollectionQuery({ id: "trash" });

  const collectionTree = useMemo<CollectionTreeItem[]>(() => {
    const preparedCollections = [];
    const userPersonalCollections = currentUserPersonalCollections(
      collections,
      currentUser.id,
    );
    const displayableCollections = collections.filter(collection =>
      nonPersonalOrArchivedCollection(collection),
    );

    preparedCollections.push(...userPersonalCollections);
    preparedCollections.push(...displayableCollections);

    const tree = buildCollectionTree(preparedCollections);
    if (trashCollection) {
      const trash: CollectionTreeItem = {
        ...trashCollection,
        id: "trash",
        icon: getCollectionIcon(trashCollection),
        children: [],
      };
      tree.push(trash);
    }

    if (rootCollection) {
      const root: CollectionTreeItem = {
        ...rootCollection,
        icon: getCollectionIcon(rootCollection),
        children: [],
      };
      return [root, ...tree];
    } else {
      return tree;
    }
  }, [rootCollection, trashCollection, collections, currentUser]);

  const onCreateNewCollection = useCallback(() => {
    setModal("MODAL_NEW_COLLECTION");
  }, []);

  const closeModal = useCallback(() => setModal(null), []);

  const renderModalContent = useCallback(() => {
    if (modal === "MODAL_NEW_COLLECTION") {
      return (
        <CreateCollectionModal
          onClose={closeModal}
          onCreate={(collection: Collection) => {
            closeModal();
            onChangeLocation(Urls.collection(collection));
          }}
        />
      );
    }
    return null;
  }, [modal, closeModal, onChangeLocation]);

  const allError = props.allError || !!error;
  if (allError) {
    return <NavbarErrorView />;
  }

  const allFetched = props.allFetched && !isLoading;
  if (!allFetched) {
    return <NavbarLoadingView />;
  }

  return (
    <>
      <MainNavbarView
        {...props}
        bookmarks={bookmarks}
        isAdmin={isAdmin}
        isOpen={isOpen}
        currentUser={currentUser}
        collections={collectionTree}
        hasOwnDatabase={hasOwnDatabase}
        selectedItems={selectedItems}
        hasDataAccess={hasDataAccess}
        reorderBookmarks={reorderBookmarks}
        handleCreateNewCollection={onCreateNewCollection}
        handleCloseNavbar={closeNavbar}
        handleLogout={logout}
      />

      {modal && <Modal onClose={closeModal}>{renderModalContent()}</Modal>}
    </>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Collections.load({
    id: ROOT_COLLECTION.id,
    entityAlias: "rootCollection",
    loadingAndErrorWrapper: false,
  }),
  Collections.loadList({
    query: () => ({
      tree: true,
      "exclude-other-user-collections": true,
      "exclude-archived": true,
    }),
    loadingAndErrorWrapper: false,
  }),
  Databases.loadList({
    loadingAndErrorWrapper: false,
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(memo(MainNavbarContainer));
