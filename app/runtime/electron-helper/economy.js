const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const products = [
  { id: 'woodPickaxe', name: '木镐', icon: 'pickaxes.png', price: 150 },
  { id: 'cocoa', name: '可可果', icon: 'cocoa.png', price: 200 },
];

function walletFile() {
  return path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'dsh-pet', 'wallet.json');
}

function readWallet() {
  const file = walletFile();
  if (!fs.existsSync(file)) return { emeralds: 0, woodPickaxe: 0, cocoa: 0 };
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Object.fromEntries(['emeralds', 'woodPickaxe', 'cocoa'].map((key) => {
    if (!Number.isSafeInteger(saved[key]) || saved[key] < 0) throw new Error('背包数据无效');
    return [key, saved[key]];
  }));
}

function saveWallet(wallet) {
  const file = walletFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(wallet, null, 2));
  fs.renameSync(file + '.tmp', file);
}

function rewardEmeralds(count) {
  const wallet = readWallet();
  wallet.emeralds += count;
  saveWallet(wallet);
  return wallet;
}

function shopRequest(action, item) {
  const wallet = readWallet();
  if (action === 'shop-buy') {
    const { id, quantity } = typeof item === 'string' ? { id: item, quantity: 1 } : (item || {});
    const product = products.find((entry) => entry.id === id);
    if (!product || product.price === null) throw new Error('这件商品尚未定价');
    if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('请输入有效的购买数量');
    if (id === 'woodPickaxe' && (wallet.woodPickaxe || quantity !== 1)) throw new Error('木镐只能购买一把');
    if (quantity > Math.floor(wallet.emeralds / product.price)) throw new Error('绿宝石不够');
    wallet.emeralds -= product.price * quantity;
    wallet[id] += quantity;
    saveWallet(wallet);
  }
  if (action === 'pet-item-action') {
    if (item === 'mine') {
      if (!wallet.woodPickaxe) throw new Error('需要先有一把木镐');
    } else if (item === 'feed' || item === 'steal') {
      if (!wallet.cocoa) {
        if (item === 'steal') return { ok: true, played: false };
        throw new Error('背包里没有可可果');
      }
      wallet.cocoa--;
      saveWallet(wallet);
    } else throw new Error('未知动作');
    return { ok: true, played: true };
  }
  return { ok: true, wallet, products };
}

module.exports = { rewardEmeralds, shopRequest };
