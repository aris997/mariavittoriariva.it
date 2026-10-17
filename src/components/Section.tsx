import type { ReactNode } from 'react'
import { Reveal } from './Reveal'

interface SectionProps {
  id?: string
  index: number
  heading: string
  intro?: string
  className?: string
  children: ReactNode
}

export function Section({ id, index, heading, intro, className = '', children }: SectionProps) {
  const headingId = `${id ?? `section-${index}`}-heading`
  return (
    <section id={id} className={`section ${className}`.trim()} aria-labelledby={headingId}>
      <div className="container">
        <Reveal className="section__head">
          <span className="section__index" aria-hidden="true">
            {String(index).padStart(2, '0')}
          </span>
          <h2 id={headingId} className="section__title">
            {heading}
          </h2>
          {intro && <p className="section__intro">{intro}</p>}
        </Reveal>
        {children}
      </div>
    </section>
  )
}
