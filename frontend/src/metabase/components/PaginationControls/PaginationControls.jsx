import styled from "@emotion/styled";
import PropTypes from "prop-types";
import { Fragment } from "react";
import { t } from "ttag";

import Button from "metabase/core/components/Button";

const StyledPaginationButton = styled(Button)`
  [dir="rtl"] & {
    transform: scaleX(-1);
  }
`;

export default function PaginationControls({
  page,
  pageSize,
  itemsLength,
  total,
  showTotal,
  onNextPage,
  onPreviousPage,
}) {
  const isSinglePage = total !== undefined && total <= pageSize;

  if (isSinglePage) {
    return null;
  }

  const isPreviousDisabled = page === 0;
  const isNextDisabled =
    total != null ? isLastPage(page, pageSize, total) : !onNextPage;

  return (
    <div className="flex align-center text-bold" aria-label="pagination">
      <span className="mr1">
        {page * pageSize + 1} - {page * pageSize + itemsLength}
        {showTotal && (
          <Fragment>
            <span className="text-light">&nbsp;{t`of`}&nbsp;</span>
            <span data-testid="pagination-total">{total}</span>
          </Fragment>
        )}
      </span>
      <StyledPaginationButton
        onlyIcon
        icon="chevronleft"
        onClick={onPreviousPage}
        disabled={isPreviousDisabled}
        data-testid="previous-page-btn"
        aria-label={t`Previous page`}
      />
      <StyledPaginationButton
        onlyIcon
        icon="chevronright"
        onClick={onNextPage}
        disabled={isNextDisabled}
        data-testid="next-page-btn"
        aria-label={t`Next page`}
      />
    </div>
  );
}

PaginationControls.propTypes = {
  page: PropTypes.number.isRequired,
  pageSize: PropTypes.number.isRequired,
  itemsLength: PropTypes.number.isRequired,
  total: PropTypes.number,
  showTotal: PropTypes.bool,
  onNextPage: PropTypes.func,
  onPreviousPage: PropTypes.func,
};

PaginationControls.defaultProps = {
  showTotal: false,
};

export const isLastPage = (pageIndex, pageSize, total) =>
  pageIndex === Math.ceil(total / pageSize) - 1;
