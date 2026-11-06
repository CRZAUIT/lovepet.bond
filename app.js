/* 喵链 · 共享逻辑：RPC 连接、链上读取、工具函数 */

const RPC_PROXY = window.location.origin + '/rpc';
const RPC_DIRECT = 'https://polygon-amoy.drpc.org';

// 部署新合约后，把这里换成 Remix 里拿到的新地址
const CONTRACT_ADDRESS = '0x599A197C8cF59B36CB2a138C74C5b1ed5c6141dF';
const IPFS_GATEWAY = 'https://aqua-tricky-peafowl-770.mypinata.cloud/ipfs/';

// ── 反馈联系方式：想换成你的，改这几行（分开写是为了防爬虫抓取）──
// 不想要哪一项，就把对应的值设成空字符串 ''（例如 const CONTACT_PHONE = ''）
const CONTACT_USER = '3685053922';
const CONTACT_DOMAIN = 'qq.com';
const CONTACT_WECHAT = 'HashYan';
const CONTACT_PHONE = '15362001021';

const ABI = [
  'function owner() view returns (address)',
  'function getCatCount() view returns (uint256)',
  'function getHelpCount() view returns (uint256)',
  'function getCats(uint256 _offset, uint256 _limit) view returns (tuple(string catId, string name, uint256 timestamp)[] memory)',
  'function getHelps(uint256 _offset, uint256 _limit) view returns (tuple(string helperName, string catId, string action, string message, string proofHash, uint256 timestamp)[] memory)',
];

async function connectProvider() {
  try {
    const p = new ethers.JsonRpcProvider(RPC_PROXY, undefined, { staticNetwork: true });
    await p.getBlockNumber();
    return p;
  } catch {
    const p = new ethers.JsonRpcProvider(RPC_DIRECT, undefined, { staticNetwork: true });
    await p.getBlockNumber();
    return p;
  }
}

async function getContract() {
  const provider = await connectProvider();
  return new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
}

// 读取链下猫咪档案
async function loadCats() {
  const res = await fetch('cats.json');
  if (!res.ok) throw new Error('cats.json 读取失败');
  return res.json();
}

function formatTime(ts) {
  const d = new Date(Number(ts) * 1000);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function truncateHash(h) {
  if (!h || h.length < 12) return h || '-';
  return h.slice(0, 6) + '...' + h.slice(-4);
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 读取链下志愿者档案
async function loadVolunteers() {
  const res = await fetch('volunteers.json');
  if (!res.ok) throw new Error('volunteers.json 读取失败');
  return res.json();
}

// 读取链下日常视频清单（不上链）
async function loadVideos() {
  const res = await fetch('videos.json');
  if (!res.ok) throw new Error('videos.json 读取失败');
  return res.json();
}

// 找出属于某志愿者的链上记录：matchNames 里任一名字被 helperName 包含即算
function helpsForVolunteer(v, helps) {
  const keys = (v.matchNames && v.matchNames.length ? v.matchNames : [v.name]).filter(Boolean);
  return helps.filter(h => {
    const hn = h.helperName || '';
    return keys.some(k => hn.includes(k));
  });
}

// 页脚反馈卡片（三个页面共用，点击任意一项复制对应内容）
function renderContact() {
  const footer = document.querySelector('footer');
  if (!footer || document.getElementById('contactCard')) return;

  const items = [];
  if (CONTACT_USER) items.push(['✉ 邮箱', CONTACT_USER + '@' + CONTACT_DOMAIN]);
  if (CONTACT_WECHAT) items.push(['微信', CONTACT_WECHAT]);
  if (CONTACT_PHONE) items.push(['☎ 电话', CONTACT_PHONE]);
  if (!items.length) return;

  const card = document.createElement('div');
  card.id = 'contactCard';
  card.className = 'contact-card';
  card.innerHTML = `
    <div class="contact-title">✉ 有想法想告诉我？</div>
    <p class="contact-hint">欢迎联系，点击任意一项即可复制</p>
    <div class="contact-list">
      ${items.map(([label, val]) => `
        <button class="contact-item" type="button" data-copy="${escapeHtml(val)}">
          <span class="contact-label">${escapeHtml(label)}</span>
          <span class="contact-value">${escapeHtml(val)}</span>
        </button>`).join('')}
    </div>
  `;

  card.querySelectorAll('.contact-item').forEach(btn => {
    btn.addEventListener('click', () => {
      navigator.clipboard?.writeText(btn.dataset.copy);
      const valueEl = btn.querySelector('.contact-value');
      const original = valueEl.textContent;
      valueEl.textContent = '已复制 ✓';
      setTimeout(() => { valueEl.textContent = original; }, 1500);
    });
  });

  footer.insertBefore(card, footer.firstChild);
}

renderContact();
