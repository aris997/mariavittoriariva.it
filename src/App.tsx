import { useEffect } from 'react'
import { About } from './components/About'
import { Contact } from './components/Contact'
import { Education } from './components/Education'
import { Experience } from './components/Experience'
import { Footer } from './components/Footer'
import { Header } from './components/Header'
import { Hero } from './components/Hero'
import { Languages } from './components/Languages'
import { useI18n } from './i18n'

export function App() {
  const { t } = useI18n()

  useEffect(() => {
    document.title = t.meta.title
    document.querySelector('meta[name="description"]')?.setAttribute('content', t.meta.description)
  }, [t])

  return (
    <>
      <Header />
      <main id="main" tabIndex={-1}>
        <Hero />
        <About />
        <Experience />
        <Education />
        <Languages />
        <Contact />
      </main>
      <Footer />
    </>
  )
}
