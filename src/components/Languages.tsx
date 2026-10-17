import { EXTRAS, SPOKEN, TOOLS } from '../content/data'
import { formatWhen, useI18n } from '../i18n'
import { Reveal } from './Reveal'
import { Section } from './Section'

export function Languages() {
  const { lang, t } = useI18n()
  return (
    <Section id="languages" index={4} heading={t.languages.heading}>
      <div className="langs">
        <ul className="langs__list">
          {SPOKEN.map((s, i) => (
            <Reveal as="li" key={s.id} className="lang-row" delay={i * 70}>
              <span className="lang-row__name">{t.languages.items[s.id].name}</span>
              <span className="lang-row__level">{t.languages.items[s.id].level}</span>
              <span className="meter" aria-hidden="true">
                {Array.from({ length: 5 }, (_, n) => (
                  <span key={n} className={n < s.level ? 'is-on' : ''} />
                ))}
              </span>
            </Reveal>
          ))}
        </ul>

        <Reveal className="tools" delay={120}>
          <h3 className="subheading">{t.languages.toolsHeading}</h3>
          <ul className="chips">
            {TOOLS.map((tool) => (
              <li key={tool} className="chip">
                {tool}
              </li>
            ))}
          </ul>
        </Reveal>
      </div>

      <h3 className="subheading">{t.extras.heading}</h3>
      <ul className="extras">
        {EXTRAS.map((x, i) => {
          const c = t.extras.items[x.id]
          return (
            <Reveal as="li" key={x.id} className="card extra" delay={i * 90}>
              <p className="extra__when">
                {formatWhen(x.when, lang)}
                {lang === 'ja' ? '／' : ' · '}
                {t.places[x.place]}
              </p>
              <h4 className="extra__title">{c.title}</h4>
              <p className="extra__role">{c.role}</p>
              {c.text && <p className="extra__text">{c.text}</p>}
            </Reveal>
          )
        })}
      </ul>
    </Section>
  )
}
