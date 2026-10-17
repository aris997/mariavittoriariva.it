import { EXPERIENCE } from '../content/data'
import { formatWhen, useI18n } from '../i18n'
import { PinIcon } from './Icons'
import { Reveal } from './Reveal'
import { Section } from './Section'

export function Experience() {
  const { lang, t } = useI18n()
  return (
    <Section id="experience" index={2} heading={t.experience.heading} intro={t.experience.intro}>
      <ol className="timeline">
        {EXPERIENCE.map((entry) => {
          const first = entry.roles[0].when
          const last = entry.roles[entry.roles.length - 1].when
          const span = formatWhen({ from: last.from, to: first.to }, lang)
          return (
            <Reveal as="li" key={entry.id} className={`timeline__item ${entry.featured ? 'is-featured' : ''}`}>
              <div className="timeline__meta">
                <span className="timeline__when">{span}</span>
                <span className="timeline__place">
                  <PinIcon /> {t.places[entry.place]}
                </span>
              </div>
              <span className="timeline__dot" aria-hidden="true" />
              <article className="card timeline__card">
                {entry.featured && <span className="badge">{t.experience.featuredBadge}</span>}
                <h3 className="timeline__title">{t.experience.entries[entry.id]}</h3>
                {entry.roles.map((role) => {
                  const r = t.experience.roles[role.id]
                  return (
                    <div className="role" key={role.id}>
                      <p className="role__title">
                        {r.title}
                        {r.employer && <span className="role__employer"> · {r.employer}</span>}
                      </p>
                      {entry.roles.length > 1 && <p className="role__when">{formatWhen(role.when, lang)}</p>}
                      <ul className="role__bullets">
                        {r.bullets.map((b, i) => (
                          <li key={i}>{b}</li>
                        ))}
                      </ul>
                    </div>
                  )
                })}
              </article>
            </Reveal>
          )
        })}
      </ol>
    </Section>
  )
}
