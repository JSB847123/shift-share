const STEPS = [
  { label: '기간·인원', icon: '📅' },
  { label: '대상자', icon: '👤' },
  { label: '제외일', icon: '🚫' },
  { label: '결과', icon: '📊' },
]

interface Props {
  current: number
  onStepClick: (step: number) => void
}

export default function StepIndicator({ current, onStepClick }: Props) {
  return (
    <div className="flex items-center justify-center gap-1 sm:gap-2 mb-8">
      {STEPS.map((step, i) => (
        <div key={i} className="flex items-center">
          <button
            onClick={() => onStepClick(i)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer
              ${
                i === current
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                  : i < current
                    ? 'bg-blue-600/20 text-blue-300 hover:bg-blue-600/30'
                    : 'bg-slate-800 text-slate-500 hover:bg-slate-700'
              }`}
          >
            <span className="text-base">{step.icon}</span>
            <span className="hidden sm:inline">{step.label}</span>
            <span className="sm:hidden text-xs">{i + 1}</span>
          </button>
          {i < STEPS.length - 1 && (
            <div
              className={`w-6 sm:w-10 h-0.5 mx-1 ${
                i < current ? 'bg-blue-600' : 'bg-slate-700'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  )
}
