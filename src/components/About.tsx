import { STRENGTHS, type StrengthId } from '../content/data'
import { useI18n } from '../i18n'
import { BridgeIcon, ProtocolIcon, TeamIcon, VenueIcon } from './Icons'
import { Reveal } from './Reveal'
import { Section } from './Section'

const ICONS: Record<StrengthId, typeof VenueIcon> = {
  venueOps: VenueIcon,
  protocol: ProtocolIcon,
  teams: TeamIcon,
  bridge: BridgeIcon,
}

export function About() {
  const { t } = useI18n()
  return (
    <Section id="about" index={1} heading={t.about.heading}>
      <div className="about">
        {t.about.paragraphs.map((p, i) => (
          <Reveal as="p" key={i} className={i === 0 ? 'about__lead' : ''} delay={i * 80}>
            {p}
          </Reveal>
        ))}
      </div>

      <h3 className="subheading">{t.strengths.heading}</h3>
      <ul className="strengths">
        {STRENGTHS.map((id, i) => {
          const StrengthIcon = ICONS[id]
          return (
            <Reveal as="li" key={id} className="card strength" delay={i * 90}>
              <span className="strength__icon">
                <StrengthIcon />
              </span>
              <h4 className="strength__title">{t.strengths.items[id].title}</h4>
              <p>{t.strengths.items[id].text}</p>
            </Reveal>
          )
        })}
      </ul>
    </Section>
  )
}
