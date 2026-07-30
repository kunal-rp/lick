import { useState } from 'react'
import { Editor } from './components/Editor'
import { Preview } from './components/Preview'
import { SplitPane } from './components/SplitPane'
import './App.css'

const SAMPLE = `Title:
    _**THE BLANK PAGE**_
Credit: Written by
Author: A. Screenwriter
Draft date: 7/30/2026
Contact:
    Level Ground Pictures
    123 Marquee Ave.
    Los Angeles, CA 90028

INT. COFFEE SHOP - DAY

A cramped, sunlit room. MAYA, 30s, hunches over a laptop that has
seen better decades.

MAYA
This is the first thing I've written all day.

(beat)

And it's a screenplay about writing a screenplay.

A BARISTA slides a mug across the counter.

BARISTA
Refill?

MAYA
(not looking up)
Keep them coming.

She types furiously. The screen fills with words, then empties
again as she deletes every single one of them.

MAYA (CONT'D)
Nope. Nope. Definitely nope.

The BARISTA lingers, reading over her shoulder.

BARISTA
For what it's worth, I'd watch it.

MAYA
You'd watch a blank page?

BARISTA
I'd watch someone brave enough to stare at one this long.

MAYA
(raising her mug)
To blank pages.

BARISTA ^
To full ones.

Maya almost smiles. Almost.

EXT. CITY STREET - NIGHT

Rain slicks the pavement. MAYA walks, laptop clutched to her chest
like something that might get away.

MAYA (V.O.)
Every story I start turns into the story of me starting it.

A CAR hisses past, headlights sweeping across her face.

MAYA (V.O.) (CONT'D)
Maybe that's the only story I actually know how to tell.

She stops beneath a flickering streetlight and looks up into the
falling rain.

MAYA
(to herself)
Okay. New page.

CUT TO:

===

INT. MAYA'S APARTMENT - LATER

Sparse. One desk, one lamp, one chair. She sits, opens the laptop,
and cracks her knuckles.

MAYA
Scene one. For real this time.

She begins to type. We PUSH IN on the screen until the cursor
blinks, enormous, waiting.

INSERT - THE SCREEN

Two words appear, then hold: *FADE IN:*

BACK TO SCENE

Maya exhales. For the first time all day, she keeps going.

> FADE OUT.
`

export default function App() {
  const [source, setSource] = useState(SAMPLE)
  // Source line indices where the preview breaks a page; the editor draws a
  // dashed guide at each so the writer sees page boundaries in context.
  const [pageBreakLines, setPageBreakLines] = useState<number[]>([])

  return (
    <div className="app">
      <main className="app__body">
        <SplitPane
          left={
            <Editor
              initialValue={source}
              onChange={setSource}
              pageBreakLines={pageBreakLines}
            />
          }
          right={<Preview source={source} onPageBreaks={setPageBreakLines} />}
        />
      </main>
    </div>
  )
}
