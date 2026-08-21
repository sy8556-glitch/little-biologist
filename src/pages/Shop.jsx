import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FocusedLayout from '../components/common/FocusedLayout'
import ConfirmationModal from '../components/common/ConfirmationModal'
import ResultModal from '../components/common/ResultModal'
import { mockShopItems } from '../data/mockData'
import { useCurrency } from '../context/CurrencyContext'
import { useBag } from '../context/BagContext'
import GachaModal from '../components/features/GachaModal'
import { useSceneBackgroundMusic } from '../components/common/BackgroundMusicController'
import { playSfx } from '../utils/sound'
import { SFX } from '../utils/sfx'
import { NatureButton, NatureCard, NaturePage, NaturePanel, NatureSectionTitle, NatureTab } from '../components/common/NatureUI'
import { Gift, Leaf, PackageOpen, ShoppingBag } from 'lucide-react'

const SHOP_MUSIC_SRC = encodeURI('/sounds/BGM CashShop.mp3')

// shop.md: 재화/뽑기/아이템 탭 (D-008). 뽑기는 게임 내 재화(나뭇잎)만 쓰는 확률형으로
// 보호자·법적 검토 완료 후 구현함(2026-08-05). 재화 탭은 실제 현금 결제 UI 미리보기만 두고,
// 구매 버튼은 보호자·법적 검토가 끝나기 전까지 아무 동작도 하지 않는다.
const TABS = [
  { id: 'recommend', label: '추천' },
  { id: 'currency', label: '재화' },
  { id: 'gacha', label: '뽑기' },
  { id: 'item', label: '아이템' },
]

// 인테리어 아이템의 theme 필드(basic/winter/sea) 기준 분류. IMAGE/인테리어 하위 테마 폴더와 대응된다.
const THEMES = [
  { id: 'all', label: '전체' },
  { id: 'basic', label: '기본' },
  { id: 'winter', label: '겨울' },
  { id: 'sea', label: '바다' },
]

// confirmPurchase가 실제로 처리할 수 있는 항목만 추천 탭에 올린다 — id 's2'(가방 확장권)는
// expandBag()로 이어지지만, 인테리어가 아닌 다른 항목은 지급 로직이 없어 결제만 되고 아무것도
// 못 받는 문제가 생기므로 추가하지 않는다.
const RECOMMENDED_ITEMS = [
  { id: 's2', name: '가방 확장권', desc: '가방 슬롯을 10칸 확장해요', priceLeaf: 300, category: 'upgrade' },
]

function ShopItemCard({ item, leaves, onPurchase }) {
  const Icon = item.id === 's2' ? PackageOpen : Gift

  return (
    <NatureCard className="flex min-h-[230px] flex-col items-center text-center">
      <div className="mb-4 grid h-24 w-24 place-items-center rounded-full border border-[var(--nature-line)] bg-[#fff7de]">
        {item.image ? (
          <img src={item.image} alt="" loading="lazy" decoding="async" className="h-full w-full object-contain p-2" />
        ) : (
          <Icon size={40} className="text-[var(--nature-green)]" aria-hidden="true" />
        )}
      </div>
      <p className="text-lg font-black text-[var(--nature-ink)]">{item.name}</p>
      <p className="mt-2 min-h-10 text-sm font-semibold leading-relaxed text-[var(--nature-muted)]">{item.desc}</p>
      <NatureButton
        onClick={() => onPurchase(item)}
        disabled={leaves < item.priceLeaf}
        className="mt-auto flex w-full items-center justify-center gap-2 disabled:border-[var(--nature-line)] disabled:bg-[var(--nature-disabled)] disabled:text-[var(--nature-muted)]"
      >
        <Leaf size={16} aria-hidden="true" />
        {item.priceLeaf}
      </NatureButton>
    </NatureCard>
  )
}

export default function Shop() {
  useSceneBackgroundMusic(SHOP_MUSIC_SRC)
  const navigate = useNavigate()
  const { leaves, addLeaves } = useCurrency()
  const { addItem, expandBag } = useBag()
  const [tab, setTab] = useState(TABS[0].id)
  const [theme, setTheme] = useState('all')
  const [pendingItem, setPendingItem] = useState(null)
  const [purchased, setPurchased] = useState(null)

  const items = tab === 'item' ? mockShopItems.item.filter((item) => theme === 'all' || item.theme === theme) : []

  function confirmPurchase() {
    addLeaves(-pendingItem.priceLeaf)
    if (pendingItem.id === 's2') {
      expandBag()
    } else if (pendingItem.category === 'interior') {
      addItem({ id: pendingItem.id, name: pendingItem.name, category: 'interior', image: pendingItem.image })
    }
    setPurchased(pendingItem)
    setPendingItem(null)
  }

  return (
    <FocusedLayout>
      <NaturePage>
        <NatureSectionTitle iconSrc="/ui/shop.png" title="상점" aside={<Leaf size={18} aria-hidden="true" />} />

        <div className="mb-5 flex flex-wrap gap-3">
          {TABS.map((t) => (
            <NatureTab key={t.id} onClick={() => setTab(t.id)} active={tab === t.id}>
              {t.label}
            </NatureTab>
          ))}
        </div>

        {tab === 'item' && (
          <div className="mb-5 flex flex-wrap gap-2">
            {THEMES.map((t) => (
              <NatureTab key={t.id} onClick={() => setTheme(t.id)} active={theme === t.id} className="min-h-9 px-4 py-1.5 text-xs">
                {t.label}
              </NatureTab>
            ))}
          </div>
        )}

        <NaturePanel>
          {tab === 'gacha' ? (
            <GachaModal />
          ) : tab === 'currency' ? (
            <div className="flex gap-4 overflow-x-auto pb-2">
              {mockShopItems.currency.map((item) => (
                <NatureCard key={item.id} className="flex w-72 shrink-0 flex-col gap-3">
                  <img src={item.image} alt={item.name} loading="lazy" decoding="async" className="w-full rounded-2xl object-contain" />
                  <button type="button" onClick={() => playSfx(SFX.currencyPurchase)} data-click-sfx="none" className="w-full">
                    <img src={item.buttonImage} alt={`${item.priceWon.toLocaleString()}원 구매하기`} loading="lazy" decoding="async" className="w-full object-contain" />
                  </button>
                </NatureCard>
              ))}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {(tab === 'recommend' ? RECOMMENDED_ITEMS : items).map((item) => (
                <ShopItemCard key={item.id} item={item} leaves={leaves} onPurchase={setPendingItem} />
              ))}
            </div>
          )}

          <NatureButton variant="secondary" onClick={() => navigate('/bag')} className="mt-5 flex w-full items-center justify-center gap-2 text-base">
            <ShoppingBag size={18} aria-hidden="true" />
            가방 열기
          </NatureButton>
        </NaturePanel>
      </NaturePage>

      <ConfirmationModal
        open={Boolean(pendingItem)}
        title={`${pendingItem?.name}을(를) 구매할까요?`}
        description={pendingItem ? `나뭇잎 ${pendingItem.priceLeaf}개가 사용돼요.` : ''}
        confirmLabel="구매하기"
        onConfirm={confirmPurchase}
        onCancel={() => setPendingItem(null)}
      />

      <ResultModal
        open={Boolean(purchased)}
        title="구매 완료!"
        description={
          purchased?.id === 's2'
            ? '가방 공간이 10칸 늘었고 바로 적용됐어요.'
            : purchased
              ? `${purchased.name}이(가) 가방에 담겼어요.`
              : ''
        }
        onConfirm={() => setPurchased(null)}
      />
    </FocusedLayout>
  )
}
