import { useMemo } from 'react'
import { FOOD_PYRAMID_TIERS } from '../../data/foodPyramid'
import { INSECT_SPECIES } from '../../data/insectSpecies'
import InsectCard from './InsectCard'

const tierClasses = {
  rose: {
    frame: 'border-rose-300 food-pyramid-tier--rose',
    rail: 'bg-rose-500',
    badge: 'bg-rose-500 text-white',
    group: 'border-rose-100',
    tint: 'bg-rose-100/55',
  },
  orange: {
    frame: 'border-orange-300 food-pyramid-tier--orange',
    rail: 'bg-orange-500',
    badge: 'bg-orange-500 text-white',
    group: 'border-orange-100',
    tint: 'bg-orange-100/55',
  },
  amber: {
    frame: 'border-amber-300 food-pyramid-tier--amber',
    rail: 'bg-amber-500',
    badge: 'bg-amber-500 text-white',
    group: 'border-amber-100',
    tint: 'bg-amber-100/60',
  },
  leaf: {
    frame: 'border-leaf-300 food-pyramid-tier--leaf',
    rail: 'bg-leaf-500',
    badge: 'bg-leaf-500 text-white',
    group: 'border-leaf-100',
    tint: 'bg-leaf-100/70',
  },
}

const tierBackgrounds = {
  primary: '/ui/food-pyramid/tier-1.png',
  small: '/ui/food-pyramid/tier-2.png',
  middle: '/ui/food-pyramid/tier-3.png',
  apex: '/ui/food-pyramid/tier-4.png',
}

export default function FoodPyramid({ onClose, speciesList = INSECT_SPECIES }) {
  const speciesById = useMemo(() => new Map(speciesList.map((species) => [species.id, species])), [speciesList])

  return (
    <div className="relative w-[min(1240px,calc(100vw-24px))]">
      <button
        type="button"
        onClick={onClose}
        aria-label="먹이사슬 피라미드 닫기"
        className="food-pyramid-close"
      >
        x
      </button>

      <section className="food-pyramid-modal flex max-h-[95vh] min-h-0 w-full flex-col">
        <div className="food-pyramid-title-bar">
          <img
            src="/ui/food-pyramid/title-cropped.png"
            alt="먹이사슬 피라미드"
            className="food-pyramid-title-logo"
          />
        </div>

        <div className="food-pyramid-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-3 pt-1">
        <div className="space-y-3">
          {FOOD_PYRAMID_TIERS.map((tier, index) => {
            const classes = tierClasses[tier.color]
            const width = 68 + index * 10

            return (
              <div
                key={tier.id}
                className={`food-pyramid-tier mx-auto grid w-full grid-cols-1 gap-2 rounded-xl border p-2 sm:w-[var(--tier-width)] sm:grid-cols-[136px_1fr] ${classes.frame}`}
                style={{
                  '--tier-width': `${width}%`,
                  backgroundImage: `linear-gradient(90deg, rgba(255, 253, 247, 0.42), rgba(255, 253, 247, 0.18)), url(${tierBackgrounds[tier.id]})`,
                }}
              >
                <div className="food-pyramid-tier-info grid grid-cols-[6px_1fr] overflow-hidden rounded-lg bg-white/70 shadow-sm">
                  <div className={classes.rail} />
                  <div className="flex flex-col justify-center px-2 py-2">
                    <span className={`mb-1 w-fit rounded-full px-2 py-0.5 text-[10px] font-bold ${classes.badge}`}>
                      {tier.level}
                    </span>
                    <strong className="text-xs leading-tight text-ink-900">{tier.title}</strong>
                    <span className="mt-0.5 text-[10px] font-semibold text-ink-700/55">총 {tier.count}종</span>
                    <p className="food-pyramid-tier-feature mt-1 text-[10px] font-medium leading-snug text-ink-700/68">
                      {tier.feature}
                    </p>
                  </div>
                </div>

                <div className="food-pyramid-groups flex flex-wrap gap-1.5">
                  {tier.groups.map((group) => (
                    <div
                      key={group.title}
                      className={`food-pyramid-group min-w-[96px] flex-1 rounded-lg border bg-white/80 p-1.5 shadow-sm ${classes.group}`}
                    >
                      <div className={`mb-1.5 w-fit rounded px-1.5 py-0.5 ${classes.tint}`}>
                        <p className="break-keep text-[10px] font-bold leading-tight text-ink-900">{group.title}</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {group.speciesIds.map((id) => {
                          const species = speciesById.get(id)
                          if (!species) return null
                          return (
                            <div key={id} className="w-20 shrink-0">
                              <InsectCard
                                name={species.name}
                                image={species.image}
                                rank={species.rank}
                                registered={species.registered}
                                showRankDot={false}
                              />
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
          </div>
        </div>
      </section>
    </div>
  )
}
