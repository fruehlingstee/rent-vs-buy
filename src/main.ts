import './style.css'

// Chart.js は CDN 経由のため、グローバル変数として宣言
declare const Chart: any

// ─── 型定義（TypeScript の基本：interface で入力データの形を決める） ───

interface BuyInputs {
  price: number        // 物件価格（万円）
  downPayment: number  // 頭金（万円）
  interestRate: number // 年利（%）
  loanYears: number    // ローン期間（年）
  monthlyFee: number   // 管理費＋修繕積立（万円/月）
  propertyTax: number  // 固定資産税（万円/年）
}

interface RentInputs {
  monthlyRent: number  // 家賃（万円/月）
  monthlyFee: number   // 管理費（万円/月）
  renewalFee: number   // 更新料（万円・2年ごと）
}

// ─── 計算ロジック ───

// 元利均等返済の月額ローン返済額を求める
function calcMonthlyPayment(principal: number, annualRate: number, years: number): number {
  if (annualRate === 0) return principal / (years * 12)
  const r = annualRate / 100 / 12
  const n = years * 12
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
}

// 購入の累計コストを年数ごとに配列で返す
function calcBuyCosts(inputs: BuyInputs, maxYears: number): number[] {
  const principal = inputs.price - inputs.downPayment
  const monthly = calcMonthlyPayment(principal, inputs.interestRate, inputs.loanYears)

  return Array.from({ length: maxYears }, (_, i) => {
    const years = i + 1
    const loanMonths = Math.min(years * 12, inputs.loanYears * 12)
    return (
      inputs.downPayment +
      monthly * loanMonths +
      inputs.monthlyFee * 12 * years +
      inputs.propertyTax * years
    )
  })
}

// 賃貸の累計コストを年数ごとに配列で返す
function calcRentCosts(inputs: RentInputs, maxYears: number): number[] {
  return Array.from({ length: maxYears }, (_, i) => {
    const years = i + 1
    const renewals = Math.floor(years / 2)
    return (
      (inputs.monthlyRent + inputs.monthlyFee) * 12 * years +
      renewals * inputs.renewalFee
    )
  })
}

// 購入コストが賃貸コストを初めて下回る年を返す（ない場合は null）
function findBreakeven(buyCosts: number[], rentCosts: number[]): number | null {
  for (let i = 0; i < buyCosts.length; i++) {
    if (buyCosts[i] <= rentCosts[i]) return i + 1
  }
  return null
}

// ─── UI の組み立て ───

const MAX_YEARS = 100

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
<header>
  <h1>賃貸 vs 購入<br><span>比較シミュレーター</span></h1>
  <p>何年住めば購入が得になるか、一目でわかります。</p>
</header>

<main>
  <form id="sim-form">
    <div class="form-grid">
      <section class="form-section buy">
        <h2>購入条件</h2>
        <label>物件価格（万円）
          <input type="number" id="price" value="4000" min="0">
          <span class="error-msg" id="err-price"></span>
        </label>
        <label>頭金（万円）
          <input type="number" id="downPayment" value="400" min="0">
          <span class="error-msg" id="err-downPayment"></span>
        </label>
        <label>住宅ローン金利（%）
          <input type="number" id="interestRate" value="0.5" step="0.01" min="0" max="20">
          <span class="error-msg" id="err-interestRate"></span>
        </label>
        <label>ローン期間（年）
          <input type="number" id="loanYears" value="35" min="1" max="50">
          <span class="error-msg" id="err-loanYears"></span>
        </label>
        <label>管理費・修繕積立（万円/月）
          <input type="number" id="buyMonthlyFee" value="2" step="0.1" min="0">
        </label>
        <label>固定資産税（万円/年）
          <input type="number" id="propertyTax" value="10" step="0.5" min="0">
        </label>
      </section>

      <section class="form-section rent">
        <h2>賃貸条件</h2>
        <label>月額家賃（万円）
          <input type="number" id="monthlyRent" value="10" step="0.5" min="0">
          <span class="error-msg" id="err-monthlyRent"></span>
        </label>
        <label>管理費（万円/月）
          <input type="number" id="rentMonthlyFee" value="0.5" step="0.1" min="0">
        </label>
        <label>更新料（万円・2年ごと）
          <input type="number" id="renewalFee" value="10" step="0.5" min="0">
        </label>
      </section>
    </div>

    <button type="submit">計算する</button>
  </form>

  <!-- 広告枠①：計算結果の直前 -->
  <div class="ad-slot" id="ad-top">
    <!-- AdSense審査通過後、以下をAdSenseのコードに置き換えてください -->
    <span class="ad-label">広告</span>
  </div>

  <section id="result" class="hidden">
    <div id="breakeven-banner"></div>
    <div class="share-row">
      <button id="share-btn" type="button">🔗 このURLをコピーしてシェア</button>
      <span id="share-feedback" class="hidden">コピーしました！</span>
    </div>
    <div class="chart-wrap">
      <canvas id="chart"></canvas>
    </div>
    <div class="table-wrap">
      <h3>累計コスト内訳</h3>
      <div class="table-scroll">
        <table id="breakdown-table">
          <thead>
            <tr>
              <th>居住年数</th>
              <th>購入 累計（万円）</th>
              <th>賃貸 累計（万円）</th>
              <th>差額（万円）</th>
              <th>有利</th>
            </tr>
          </thead>
          <tbody id="breakdown-body"></tbody>
        </table>
      </div>
    </div>
    <!-- 広告枠②：内訳テーブルの下 -->
    <div class="ad-slot" id="ad-bottom">
      <!-- AdSense審査通過後、以下をAdSenseのコードに置き換えてください -->
      <span class="ad-label">広告</span>
    </div>
  </section>
</main>
`

// ─── URL シェア ───

// 入力値をURLのクエリパラメータに保存する
function saveToUrl(buy: BuyInputs, rent: RentInputs): void {
  const params = new URLSearchParams({
    p:   String(buy.price),
    dp:  String(buy.downPayment),
    ir:  String(buy.interestRate),
    ly:  String(buy.loanYears),
    bmf: String(buy.monthlyFee),
    pt:  String(buy.propertyTax),
    mr:  String(rent.monthlyRent),
    rmf: String(rent.monthlyFee),
    rf:  String(rent.renewalFee),
  })
  history.replaceState(null, '', `?${params.toString()}`)
}

// URLのクエリパラメータからフォームを復元する
function loadFromUrl(): boolean {
  const params = new URLSearchParams(location.search)
  if (!params.has('p')) return false

  const set = (id: string, val: string | null) => {
    if (val === null) return
    const el = document.getElementById(id) as HTMLInputElement | null
    if (el) el.value = val
  }

  set('price',         params.get('p'))
  set('downPayment',   params.get('dp'))
  set('interestRate',  params.get('ir'))
  set('loanYears',     params.get('ly'))
  set('buyMonthlyFee', params.get('bmf'))
  set('propertyTax',   params.get('pt'))
  set('monthlyRent',   params.get('mr'))
  set('rentMonthlyFee',params.get('rmf'))
  set('renewalFee',    params.get('rf'))

  return true
}

// ─── フォーム送信処理 ───

let chartInstance: any = null

function getInputs(): { buy: BuyInputs; rent: RentInputs } {
  const n = (id: string): number =>
    parseFloat((document.getElementById(id) as HTMLInputElement).value) || 0

  return {
    buy: {
      price: n('price'),
      downPayment: n('downPayment'),
      interestRate: n('interestRate'),
      loanYears: n('loanYears'),
      monthlyFee: n('buyMonthlyFee'),
      propertyTax: n('propertyTax'),
    },
    rent: {
      monthlyRent: n('monthlyRent'),
      monthlyFee: n('rentMonthlyFee'),
      renewalFee: n('renewalFee'),
    },
  }
}

// エラーメッセージを設定/クリアするヘルパー
function setError(id: string, msg: string): void {
  const el = document.getElementById(id)
  if (el) el.textContent = msg
}

function clearErrors(): void {
  ;['err-price', 'err-downPayment', 'err-interestRate', 'err-loanYears', 'err-monthlyRent']
    .forEach(id => setError(id, ''))
}

// 入力値を検証し、問題があればエラーを表示して false を返す
function validate(buy: BuyInputs, rent: RentInputs): boolean {
  clearErrors()
  let valid = true

  if (buy.price <= 0) {
    setError('err-price', '物件価格を入力してください')
    valid = false
  }
  if (buy.downPayment >= buy.price) {
    setError('err-downPayment', '頭金は物件価格より小さくしてください')
    valid = false
  }
  if (buy.interestRate < 0 || buy.interestRate > 20) {
    setError('err-interestRate', '金利は0〜20%の範囲で入力してください')
    valid = false
  }
  if (buy.loanYears < 1 || buy.loanYears > 50) {
    setError('err-loanYears', 'ローン期間は1〜50年で入力してください')
    valid = false
  }
  if (rent.monthlyRent <= 0) {
    setError('err-monthlyRent', '月額家賃を入力してください')
    valid = false
  }

  return valid
}

function renderChart(buyCosts: number[], rentCosts: number[], breakeven: number | null): void {
  const labels = Array.from({ length: MAX_YEARS }, (_, i) => `${i + 1}年`)
  const ctx = (document.getElementById('chart') as HTMLCanvasElement).getContext('2d')!

  if (chartInstance) chartInstance.destroy()

  // 損益分岐点の縦線アノテーション（breakeven がある場合のみ表示）
  const annotations: any = {}
  if (breakeven !== null) {
    annotations.breakevenLine = {
      type: 'line',
      xMin: breakeven - 1,
      xMax: breakeven - 1,
      borderColor: 'rgba(34, 197, 94, 0.9)',
      borderWidth: 2,
      borderDash: [6, 3],
      label: {
        display: true,
        content: `${breakeven}年目で購入が得`,
        position: 'start',
        backgroundColor: 'rgba(34, 197, 94, 0.85)',
        color: 'white',
        font: { size: 12, weight: 'bold' },
        padding: { x: 8, y: 4 },
        borderRadius: 4,
      },
    }
  }

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '購入 累計コスト',
          data: buyCosts.map(v => Math.round(v)),
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59,130,246,0.08)',
          tension: 0.3,
          fill: true,
        },
        {
          label: '賃貸 累計コスト',
          data: rentCosts.map(v => Math.round(v)),
          borderColor: '#f97316',
          backgroundColor: 'rgba(249,115,22,0.08)',
          tension: 0.3,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          callbacks: {
            label: (ctx: any) => ` ${ctx.dataset.label}: ${ctx.raw.toLocaleString()} 万円`,
          },
        },
        annotation: { annotations },
      },
      scales: {
        y: {
          title: { display: true, text: '累計コスト（万円）' },
          ticks: { callback: (v: any) => `${v.toLocaleString()}万` },
        },
      },
    },
  })
}

function renderTable(buyCosts: number[], rentCosts: number[], breakeven: number | null): void {
  // 表示する年のリスト（5年刻み＋損益分岐点）
  const milestones = new Set<number>([5, 10, 15, 20, 25, 30, 40, 50, 75, 100])
  if (breakeven !== null) milestones.add(breakeven)
  const years = Array.from(milestones).filter(y => y <= MAX_YEARS).sort((a, b) => a - b)

  const tbody = document.getElementById('breakdown-body')!
  tbody.innerHTML = years.map(year => {
    const buy = Math.round(buyCosts[year - 1])
    const rent = Math.round(rentCosts[year - 1])
    const diff = Math.abs(buy - rent)
    const buyWins = buy <= rent
    const isBreakeven = year === breakeven

    return `
      <tr class="${isBreakeven ? 'breakeven-row' : ''}">
        <td>${year}年${isBreakeven ? ' ★' : ''}</td>
        <td class="num">${buy.toLocaleString()}</td>
        <td class="num">${rent.toLocaleString()}</td>
        <td class="num ${buyWins ? 'buy-text' : 'rent-text'}">
          ${buyWins ? '-' : '+'}${diff.toLocaleString()}
        </td>
        <td class="badge-cell">
          <span class="badge ${buyWins ? 'badge-buy' : 'badge-rent'}">
            ${buyWins ? '購入' : '賃貸'}
          </span>
        </td>
      </tr>`
  }).join('')
}

document.getElementById('sim-form')!.addEventListener('submit', (e) => {
  e.preventDefault()

  const { buy, rent } = getInputs()
  if (!validate(buy, rent)) return

  saveToUrl(buy, rent)
  const buyCosts = calcBuyCosts(buy, MAX_YEARS)
  const rentCosts = calcRentCosts(rent, MAX_YEARS)
  const breakeven = findBreakeven(buyCosts, rentCosts)

  const result = document.getElementById('result')!
  result.classList.remove('hidden')

  const banner = document.getElementById('breakeven-banner')!
  if (breakeven) {
    banner.className = 'banner buy-wins'
    banner.innerHTML = `<strong>${breakeven}年目</strong>から購入の方がお得になります`
  } else {
    banner.className = 'banner rent-wins'
    banner.innerHTML = `<strong>${MAX_YEARS}年以内</strong>では賃貸の方がお得です`
  }

  renderChart(buyCosts, rentCosts, breakeven)
  renderTable(buyCosts, rentCosts, breakeven)
  result.scrollIntoView({ behavior: 'smooth' })
})

// シェアボタン：URLをクリップボードにコピー
document.getElementById('share-btn')!.addEventListener('click', () => {
  navigator.clipboard.writeText(location.href).then(() => {
    const feedback = document.getElementById('share-feedback')!
    feedback.classList.remove('hidden')
    setTimeout(() => feedback.classList.add('hidden'), 2000)
  })
})

// ページ読み込み時にURLパラメータがあれば自動で計算を実行
if (loadFromUrl()) {
  document.getElementById('sim-form')!.dispatchEvent(new Event('submit'))
}
