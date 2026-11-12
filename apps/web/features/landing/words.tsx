import { Fragment } from 'react'

/** A heading's words as spans for the word-by-word reveal; the spaces stay text, so its name reads whole. */
export function Words({ text }: { text: string }) {
  const words = text.split(' ')
  return (
    <>
      {words.map((word, index) => (
        <Fragment key={`${word}-${index}`}>
          <span className="word">{word}</span>
          {index < words.length - 1 ? ' ' : null}
        </Fragment>
      ))}
    </>
  )
}
