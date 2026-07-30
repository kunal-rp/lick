import { useState } from 'react'
import { Editor } from './components/Editor'
import { Preview } from './components/Preview'
import { SplitPane } from './components/SplitPane'
import './App.css'

const SAMPLE = `INT. COFFEE SHOP - DAY

A cramped, sunlit room. MAYA, 30s, hunches over a laptop.

MAYA
This is the first thing I've written all day.

(beat)

And it's a screenplay about writing a screenplay.

EXT. CITY STREET - NIGHT

Rain slicks the pavement.

CUT TO:
`

export default function App() {
  const [source, setSource] = useState(SAMPLE)

  return (
    <div className="app">
      <header className="app__bar">
        <span className="app__title">Fountain Editor</span>
      </header>
      <main className="app__body">
        <SplitPane
          left={<Editor value={source} onChange={setSource} />}
          right={<Preview source={source} />}
        />
      </main>
    </div>
  )
}
