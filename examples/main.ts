import {
  AmbientLight,
  BoxGeometry,
  Clock,
  Color,
  DirectionalLight,
  GridHelper,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import { createWorld, type ModelLoader } from '@chatlychat/world';

import { createFakeConversation, message } from './fake-conversation.js';

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const reduce = el<HTMLInputElement>('reduce');
reduce.checked = matchMedia('(prefers-reduced-motion: reduce)').matches;

const renderer = new WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);
const scene = new Scene();
scene.background = new Color('#0b1020');
scene.add(new GridHelper(20, 20, '#334155', '#1e293b'), new AmbientLight('#ffffff', 1.2));
const sun = new DirectionalLight('#ffffff', 1.5);
sun.position.set(2, 4, 3);
scene.add(sun);
const camera = new PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 100);
camera.position.set(0, 1.6, 2);

// Stand-in "shoe" models: a box per url, so the example needs no assets.
const loadModel: ModelLoader = (url) =>
  Promise.resolve({
    scene: new Mesh(
      new BoxGeometry(0.3, 0.12, 0.12),
      new MeshStandardMaterial({ color: url.includes('af1') ? '#f8fafc' : '#38bdf8' }),
    ),
    animations: [],
  });

const demo = createFakeConversation();
const shop = new Mesh(new BoxGeometry(0.4, 1, 0.4), new MeshStandardMaterial({ color: '#f97316' }));
shop.position.set(4, 0.5, -6);
scene.add(shop);

const world = createWorld({
  conversation: demo.conversation,
  camera,
  reducedMotion: () => reduce.checked,
  presences: {
    '*': { name: 'Mia', nameTag: 'Mia · Stylist', description: 'a guide in a red jacket' },
  },
  theme: {
    cardPedestal: 'plinth',
    cardBeam: true,
    motionEntrance: 'scale',
    bubbleDurationMs: 9000,
  },
  anchors: { resolve: (ref) => (ref === 'shop' ? shop : null) },
  loadModel,
  announce: (t) => (el('live').textContent = t),
  onComposeRequest: () => {
    el('say').style.display = 'flex';
    el('draft').focus();
  },
});
world.agent.root.position.set(-1.2, 0, -2.5);
scene.add(world.root);

// The host registers what its world can do; the bot may fire it.
world.capabilities.register('world.walk_to', () => void camera.position.set(2.5, 1.6, -4.5), {
  equivalent: { kind: 'text', text: 'The shop is straight ahead, past the orange pillar.' },
  unprompted: true,
});
world.capabilities.register(
  'scene.highlight',
  () => void ((shop.material as MeshStandardMaterial).emissive = new Color('#fde047')),
  { equivalent: { kind: 'text', text: 'The orange pillar is the shop.' } },
);

el<HTMLFormElement>('say').addEventListener('submit', (e) => {
  e.preventDefault();
  world.composer.setDraft(el<HTMLInputElement>('draft').value);
  void world.composer.submit();
  el('say').style.display = 'none';
});
el<HTMLInputElement>('dark').addEventListener('change', (e) =>
  world.setScene((e.target as HTMLInputElement).checked ? 'dark' : 'light'),
);
renderer.domElement.addEventListener('pointerdown', (e) => {
  const hit = world.pickAtPointer(
    (e.clientX / innerWidth) * 2 - 1,
    -(e.clientY / innerHeight) * 2 + 1,
  );
  if (hit !== null) world.activate(hit);
});
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// The scripted exchange.
setTimeout(
  () =>
    demo.push(
      message({
        id: 'a1',
        body: 'Hi, I am Mia. Looking for trainers?',
        metadata: { embodiment: { expression: 'wave', lookAt: { target: 'visitor' } } },
      }),
    ),
  800,
);
setTimeout(
  () => demo.set({ typing: { actorType: 'bot', actorId: 'mia', displayName: 'Mia', label: null } }),
  2200,
);
setTimeout(() => {
  demo.set({ typing: null });
  demo.push(
    message({
      id: 'a2',
      kind: 'rich',
      body: 'These two are in stock.',
      blocks: {
        v: 1,
        blocks: [
          {
            type: 'card_grid',
            placement: 'shelf',
            cards: [
              {
                id: 'dunk',
                title: 'Dunk Low Retro',
                price: { amount: 10900, currency: 'GBP' },
                model: { url: 'https://cdn.example/dunk.glb', scale: 1.5, anchor: 'base' },
              },
              {
                id: 'af1',
                title: 'Air Force 1',
                price: { amount: 9900, currency: 'GBP' },
                model: { url: 'https://cdn.example/af1.glb', anchor: 'base' },
              },
            ],
          },
        ],
      },
    }),
  );
}, 4000);
setTimeout(() => {
  demo.push(message({ id: 'a3', body: 'Let me show you where the shop is.' }));
  demo.fire({ capability: 'world.walk_to', args: { place: 'shop' } });
}, 9000);

const clock = new Clock();
renderer.setAnimationLoop(() => {
  world.update(clock.getDelta());
  renderer.render(scene, camera);
});
