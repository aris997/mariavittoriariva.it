import { EDUCATION } from '../content/data'
import { formatWhen, useI18n } from '../i18n'
import { PinIcon } from './Icons'
import { Reveal } from './Reveal'
import { Section } from './Section'

export function Education() {
  const { lang, t } = useI18n()
  return (
    <Section id="education" index={3} heading={t.education.heading}>
      <ul className="edu">
        {EDUCATION.map((e, i) => {
          const c = t.education.entries[e.id]
          return (
            <Reveal as="li" key={e.id} className="card edu__item" delay={i * 90}>
              <p className="edu__when">{formatWhen(e.when, lang)}</p>
              <h3 className="edu__institution">{c.institution}</h3>
              <p className="edu__place">
                <PinIcon /> {t.places[e.place]}
              </p>
              <p className="edu__degree">{c.degree}</p>
              <p className="edu__grade">{c.grade}</p>
              {c.details.map((d, j) => (
                <p className="edu__detail" key={j}>
                  {d}
                </p>
              ))}
            </Reveal>
          )
        })}
      </ul>
    </Section>
  )
}
