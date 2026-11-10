import { test } from 'vitest'
import { finalReviewCases } from './final-review-cases'

test.each(finalReviewCases)('$name', ({ run }) => run())
