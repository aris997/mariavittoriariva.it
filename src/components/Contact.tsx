import { CONTACT, CV_PATH } from '../content/data'
import { useI18n } from '../i18n'
import { DownloadIcon, LinkedInIcon, MailIcon, PhoneIcon } from './Icons'
import { Reveal } from './Reveal'

const email = CONTACT.email.join('@')
const phoneDisplay = CONTACT.phone.join(' ')
const phoneHref = `tel:${CONTACT.phone.join('')}`

export function Contact() {
  const { t } = useI18n()
  const links = [
    { key: 'email', href: `mailto:${email}`, label: t.contact.email, value: email, Icon: MailIcon },
    { key: 'phone', href: phoneHref, label: t.contact.phone, value: phoneDisplay, Icon: PhoneIcon },
    {
      key: 'linkedin',
      href: CONTACT.linkedin,
      label: t.contact.linkedin,
      value: 'in/maria-vittoria-riva',
      Icon: LinkedInIcon,
      external: true,
    },
  ]

  return (
    <section id="contact" className="contact" aria-labelledby="contact-heading">
      <div className="container">
        <Reveal className="contact__head">
          <span className="section__index" aria-hidden="true">
            05
          </span>
          <h2 id="contact-heading" className="contact__title">
            {t.contact.heading}
          </h2>
          <p className="contact__intro">{t.contact.intro}</p>
        </Reveal>

        <ul className="contact__links">
          {links.map(({ key, href, label, value, Icon, external }, i) => (
            <Reveal as="li" key={key} delay={i * 90}>
              <a
                className="contact-link"
                href={href}
                {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              >
                <span className="contact-link__icon">
                  <Icon />
                </span>
                <span className="contact-link__label">{label}</span>
                <span className="contact-link__value">{value}</span>
              </a>
            </Reveal>
          ))}
          <Reveal as="li" delay={270}>
            <a className="contact-link" href={CV_PATH} download>
              <span className="contact-link__icon">
                <DownloadIcon />
              </span>
              <span className="contact-link__label">{t.contact.cv}</span>
              <span className="contact-link__value">{t.contact.cvNote}</span>
            </a>
          </Reveal>
        </ul>
      </div>
    </section>
  )
}
