import { NAME } from '../content/data'
import { useI18n } from '../i18n'
import { ArrowUpIcon } from './Icons'

const YEAR = new Date().getFullYear()

export function Footer() {
  const { t } = useI18n()
  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <p>
          © {YEAR} {NAME}. {t.footer.rights}
        </p>
        <a href="#top" className="to-top">
          {t.ui.backToTop} <ArrowUpIcon />
        </a>
      </div>
    </footer>
  )
}
