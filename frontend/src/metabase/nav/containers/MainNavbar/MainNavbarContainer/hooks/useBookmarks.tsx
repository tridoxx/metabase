import { useState, useCallback, useEffect } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  useListBookmarksQuery,
  useReorderBookmarksMutation,
} from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import type { Bookmark } from "metabase-types/api";

// FIXME: I think we need to invalidate the RTK query for bookmarks whenever a collection moves into the trash
//
// FIXME: Need to handle loading state of bookmarks

export const useBookmarks = () => {
  const dispatch = useDispatch();

  // The UI's copy of the bookmarks
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);

  const bookmarksResult = useListBookmarksQuery();
  const [reorderBookmarksInAPI] = useReorderBookmarksMutation();
  const reorderBookmarksInAPIWithDebouncing = _.debounce(
    reorderBookmarksInAPI,
    500,
  );

  // Update the bookmarks in the UI based on the API only if
  // something other than the ordering of the bookmarks changes.
  // When reordering bookmarks, we update the order optimistically
  // and do not update the UI to reflect the API, to avoid race
  // conditions when the user moves multiple bookmarks in a row
  useEffect(() => {
    const bookmarksFromAPI = bookmarksResult.data || [];
    if (
      getAlphabetizedBookmarks(bookmarksFromAPI) !==
      getAlphabetizedBookmarks(bookmarks)
    ) {
      setBookmarks(bookmarksFromAPI);
    }
  }, [bookmarksResult.data, bookmarks]);

  /** Update the bookmark order optimistically in the UI, then send the new order to the API */
  const updateBookmarkOrder = useCallback(
    async (newBookmarks: Bookmark[]) => {
      // Update optimistically
      setBookmarks(newBookmarks);

      // Call API
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

  return { bookmarks, bookmarksResult, reorderBookmarks };
};

/** Get a string representation of the bookmarks in a fixed order.
 *
 * Used for determining whether something other than the order of the bookmarks has changed. */
const getAlphabetizedBookmarks = (bookmarks: Bookmark[]) => {
  const data =
    bookmarks?.map(bookmark => JSON.stringify([bookmark.name, bookmark])) || [];
  data.sort();
  return data.join(",");
};
