import { useState } from 'react'
import type { ExcludeDate, PersonExclude, PersonPin, ConflictPair, SeparateRotation, ScheduleResult } from './types'
import { generateSchedule } from './utils/scheduler'
import StepIndicator from './components/StepIndicator'
import PeriodStep from './components/PeriodStep'
import NamesStep from './components/NamesStep'
import ExcludeStep from './components/ExcludeStep'
import ResultStep from './components/ResultStep'

export default function App() {
  const [step, setStep] = useState(0)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [weekdayOnly, setWeekdayOnly] = useState(true)
  const [perDay, setPerDay] = useState(1)
  const [names, setNames] = useState<string[]>([])
  const [excludeDates, setExcludeDates] = useState<ExcludeDate[]>([])
  const [personExcludes, setPersonExcludes] = useState<PersonExclude[]>([])
  const [personPins, setPersonPins] = useState<PersonPin[]>([])
  const [conflicts, setConflicts] = useState<ConflictPair[]>([])
  const [separateRotations, setSeparateRotations] = useState<SeparateRotation[]>([])
  const [useOrder, setUseOrder] = useState(false)
  const [result, setResult] = useState<ScheduleResult | null>(null)

  const generate = () => {
    const r = generateSchedule(startDate, endDate, names, perDay, weekdayOnly, excludeDates, personExcludes, personPins, separateRotations, conflicts, useOrder)
    setResult(r)
    setStep(3)
  }

  const regenerate = () => {
    const r = generateSchedule(startDate, endDate, names, perDay, weekdayOnly, excludeDates, personExcludes, personPins, separateRotations, conflicts, useOrder)
    setResult(r)
  }

  const reset = () => {
    setStep(0)
    setStartDate('')
    setEndDate('')
    setWeekdayOnly(true)
    setPerDay(1)
    setNames([])
    setExcludeDates([])
    setPersonExcludes([])
    setPersonPins([])
    setConflicts([])
    setSeparateRotations([])
    setUseOrder(false)
    setResult(null)
  }

  const goToStep = (s: number) => {
    if (s === 3 && !result) return
    setStep(s)
  }

  return (
    <div className="min-h-screen bg-slate-950 py-6 px-4">
      <div className="max-w-2xl mx-auto">
        <header className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white">스마트 편성표</h1>
          <p className="text-sm text-slate-400 mt-1">by claude code</p>
        </header>

        <StepIndicator current={step} onStepClick={goToStep} />

        {step === 0 && (
          <PeriodStep
            startDate={startDate}
            endDate={endDate}
            weekdayOnly={weekdayOnly}
            perDay={perDay}
            separateRotations={separateRotations}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            onWeekdayOnlyChange={setWeekdayOnly}
            onPerDayChange={setPerDay}
            onSeparateRotationsChange={setSeparateRotations}
            onNext={() => setStep(1)}
          />
        )}

        {step === 1 && (
          <NamesStep
            names={names}
            onNamesChange={setNames}
            useOrder={useOrder}
            onUseOrderChange={setUseOrder}
            onPrev={() => setStep(0)}
            onNext={() => setStep(2)}
          />
        )}

        {step === 2 && (
          <ExcludeStep
            names={names}
            excludeDates={excludeDates}
            personExcludes={personExcludes}
            personPins={personPins}
            conflicts={conflicts}
            onExcludeDatesChange={setExcludeDates}
            onPersonExcludesChange={setPersonExcludes}
            onPersonPinsChange={setPersonPins}
            onConflictsChange={setConflicts}
            onPrev={() => setStep(1)}
            onNext={generate}
          />
        )}

        {step === 3 && result && (
          <ResultStep
            result={result}
            onRegenerate={regenerate}
            onReset={reset}
            onPrev={() => setStep(2)}
          />
        )}
      </div>
    </div>
  )
}
