import portrait from '../assets/portrait.jpg'
import { CV_PATH, NAME, STATS } from '../content/data'
import { useI18n } from '../i18n'
import { ArrowIcon, DownloadIcon, PinIcon } from './Icons'
import { Reveal } from './Reveal'

export function Hero() {
  const { t } = useI18n()
  const [first, ...rest] = NAME.split(' ')
  const middle = rest.slice(0, -1).join(' ')
  const last = rest[rest.length - 1]

  return (
    <section className="hero" id="top">
      <div className="hero__grid container">
        <div className="hero__text">
          <p className="hero__kicker">{t.hero.kicker}</p>
          <h1 className="hero__name">
            <span>
              {first} {middle}
            </span>{' '}
            <span className="hero__name-last">{last}</span>
          </h1>
          {t.hero.nameReading && (
            <p className="hero__reading" lang="ja">
              {t.hero.nameReading}
            </p>
          )}
          <p className="hero__role">{t.hero.role}</p>
          <p className="hero__intro">{t.hero.intro}</p>
          <p className="hero__location">
            <PinIcon /> {t.hero.location}
          </p>
          <div className="hero__actions">
            <a className="btn btn--primary" href="#contact">
              {t.hero.ctaContact} <ArrowIcon />
            </a>
            <a className="btn btn--ghost" href={CV_PATH} download>
              <DownloadIcon /> {t.hero.ctaCv}
            </a>
          </div>
        </div>

        <div className="hero__visual">
          <div className="hero__sun" aria-hidden="true" />
          <div className="hero__arch-outline" aria-hidden="true" />
          <figure className="hero__portrait">
            <img src={portrait} alt={t.hero.portraitAlt} width={193} height={250} />
          </figure>
        </div>
      </div>

      <div className="container">
        <dl className="stats">
          {STATS.map((s, i) => (
            <Reveal key={s.id} className="stat" delay={i * 90}>
              <dt className="stat__label">{t.stats[s.id].label}</dt>
              <dd className="stat__value">{s.value}</dd>
              <dd className="stat__detail">{t.stats[s.id].detail}</dd>
            </Reveal>
          ))}
        </dl>
      </div>
    </section>
  )
}
