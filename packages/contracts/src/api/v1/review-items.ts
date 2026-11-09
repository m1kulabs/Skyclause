import { listReviewItems } from './review-items/listReviewItems'
import { updateReviewItem } from './review-items/updateReviewItem'

export { listReviewItems } from './review-items/listReviewItems'
export { updateReviewItem } from './review-items/updateReviewItem'

export const routes = [listReviewItems, updateReviewItem] as const
