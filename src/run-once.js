import { loadEnv, config } from './env.js';
import { run } from './run.js';
import { loadSettings } from './settings.js';
import { userById } from './auth.js';

loadEnv();
const base = config();
const user = userById(process.env.RUN_USER_ID);
if (!user) throw new Error('Defina RUN_USER_ID de um usuário cadastrado para executar este comando.');
const saved = loadSettings(base, user.id);
const settings = {
  ...base,
  shopee: { ...base.shopee, ...saved.shopee },
  filters: saved.filters,
  automation: saved.automation,
  safety: saved.safety,
  userId: user.id,
  destinations: saved.destinations,
  directWhatsApp: saved.directWhatsApp,
  evolution: saved.evolution,
  whatsapp: { ...saved.whatsapp, recipients: saved.destinations.filter(destination => destination.active && destination.type !== 'group').map(destination => destination.number) }
};
run(settings).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
