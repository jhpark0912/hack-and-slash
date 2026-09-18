import { Game } from './core/Game';
import { ENEMIES } from './entities/EnemyTypes';
import { Enemy } from './entities/Enemy';
import { generateItem } from './rpg/Items';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const game = new Game(canvas);

// expose for debugging in the console (e.g. game.player.gainXp(500, game))
(window as any).game = game;
(window as any).__debug = { ENEMIES, Enemy, generateItem };
