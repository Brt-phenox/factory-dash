import { k } from "./kaboomLoader.js";
import { room1 } from "./scenes/room1.js";
import { room2 } from "./scenes/room2.js";
import { setBackgroundColor } from "./scenes/roomUtils.js";
import { makeNotificationBox } from "./ui/notificationBox.js";

const gs = {
  doubleJump:   false,
  dash:         false,
  depth:        0,
  maxDepth:     0,
  djUnlocked:   false,
  dashUnlocked: false,
};

const JUMP_FORCE        = 380;
const WALL_JUMP_Y       = 340;
const WALL_JUMP_X       = 190;
const DASH_SPEED        = 400;
const DASH_DURATION     = 0.14;
const DASH_COOLDOWN     = 0.85;
const WALL_SLIDE_MAX    = 45;
const COYOTE_TIME       = 0.1;
const JUMP_BUFFER       = 0.08;
const DEPTH_DJ_UNLOCK   = 220;
const DEPTH_DASH_UNLOCK = 460;
const MAX_DARKNESS      = 0.60;
const MAX_DEPTH_PX      = 800;

function depthOverlayTarget(depthPx) {
  return Math.min(MAX_DARKNESS, (depthPx / MAX_DEPTH_PX) * MAX_DARKNESS);
}

function showUnlock(msg) {
  k.play("notify", { volume: 0.55 });
  const W = 340, H = 58;
  const box = k.add([
    k.rect(W, H),
    k.pos(k.width() / 2 - W / 2, 28),
    k.color(6, 14, 34),
    k.opacity(0.94),
    k.fixed(), k.z(80),
  ]);
  const lbl = k.add([
    k.text(msg, { size: 10, font: "glyphmesss", align: "center", width: W - 24 }),
    k.pos(k.width() / 2, 28 + H / 2),
    k.anchor("center"),
    k.color(80, 210, 255),
    k.fixed(), k.z(81),
  ]);
  k.wait(2.8, () => {
    let t = 0;
    const fade = k.onUpdate(() => {
      t += k.dt();
      const a = Math.max(0, 1 - t / 0.5);
      if (box.exists()) box.opacity = 0.94 * a;
      if (lbl.exists()) lbl.opacity = a;
      if (a <= 0) {
        if (box.exists()) k.destroy(box);
        if (lbl.exists()) k.destroy(lbl);
        fade.cancel();
      }
    });
  });
}

function addHUD() {
  k.add([
    k.rect(152, 26), k.pos(8, k.height() - 40),
    k.color(0, 0, 0), k.opacity(0.5),
    k.fixed(), k.z(60),
  ]);
  k.add([
    k.text("DEPTH  0m", { size: 11, font: "glyphmesss" }),
    k.pos(12, k.height() - 36),
    k.color(80, 210, 255),
    k.fixed(), k.z(61),
    "depthLabel",
  ]);
  k.add([
    k.text("X:JUMP  Z:ATTACK  C:DASH(locked)", { size: 8, font: "glyphmesss" }),
    k.pos(12, k.height() - 16),
    k.color(155, 155, 155), k.opacity(0.75),
    k.fixed(), k.z(61),
    "abilityHint",
  ]);
}

function addOverlay() {
  k.add([
    k.rect(k.width(), k.height()),
    k.pos(0, 0),
    k.color(0, 0, 0),
    k.opacity(0),
    k.fixed(), k.z(55),
    "depthOverlay",
  ]);
}

function injectMechanics() {
  k.wait(0, () => {
    addOverlay();
    addHUD();

    let wallDir   = 0;
    let jumpsLeft = 1;
    let coyoteT   = 0;
    let bufferT   = 0;
    let dashing   = false;
    let dashCD    = 0;
    let dashT     = 0;
    let facing    = 1;

    k.onUpdate(() => {
      const player = k.get("player")[0];
      if (!player) return;

      const dt       = k.dt();
      const onGround = player.isGrounded();
      const velX     = player.vel ? player.vel.x : 0;
      const velY     = player.vel ? player.vel.y : 0;

      const depth = Math.max(0, player.pos.y - 96);
      gs.depth = depth;
      if (depth > gs.maxDepth) gs.maxDepth = depth;

      const overlay = k.get("depthOverlay")[0];
      if (overlay) {
        overlay.opacity += (depthOverlayTarget(depth) - overlay.opacity) * dt * 2.5;
      }

      const lbl = k.get("depthLabel")[0];
      if (lbl) {
        lbl.text = `DEPTH  ${Math.floor(depth / 16)}m`;
        const r = Math.min(1, depth / MAX_DEPTH_PX);
        lbl.color = k.rgb(80 + r * 175, 210 - r * 130, 255 - r * 60);
      }

      const hint = k.get("abilityHint")[0];
      if (hint) {
        const jt  = gs.doubleJump ? "X:JUMP×2" : "X:JUMP";
        const dsh = gs.dash       ? "C:DASH"   : "C:DASH(locked)";
        hint.text = `${jt}  Z:ATTACK  ${dsh}`;
      }

      if (!gs.djUnlocked && depth >= DEPTH_DJ_UNLOCK) {
        gs.djUnlocked = true;
        gs.doubleJump = true;
        showUnlock("✦ DOUBLE JUMP UNLOCKED\nPress X twice to leap further into the dark.");
      }

      if (!gs.dashUnlocked && depth >= DEPTH_DASH_UNLOCK) {
        gs.dashUnlocked = true;
        gs.dash         = true;
        showUnlock("✦ DASH UNLOCKED\nPress C to surge through the underground.");
      }

      if (onGround) {
        coyoteT   = COYOTE_TIME;
        jumpsLeft = gs.doubleJump ? 2 : 1;
      } else {
        coyoteT = Math.max(0, coyoteT - dt);
      }

      bufferT = Math.max(0, bufferT - dt);
      dashCD  = Math.max(0, dashCD  - dt);

      if (dashing) {
        dashT -= dt;
        if (player.vel) player.vel.y = 0;
        if (dashT <= 0) dashing = false;
      }

      const inAir   = !onGround && !dashing;
      const movingL = k.isKeyDown("left");
      const movingR = k.isKeyDown("right");
      const hitWall = inAir && Math.abs(velX) < 8;

      wallDir = 0;
      if (hitWall && movingL) wallDir = -1;
      if (hitWall && movingR) wallDir =  1;

      if (wallDir !== 0 && player.vel && velY > WALL_SLIDE_MAX) {
        player.vel.y = WALL_SLIDE_MAX;
        if (Math.random() < 0.25) {
          k.add([
            k.rect(2, 2),
            k.pos(player.pos.add(k.vec2(wallDir * 8, k.rand(-5, 5)))),
            k.color(60, 170, 255), k.opacity(0.9), k.z(15),
            {
              update() {
                this.pos.y  += k.dt() * 28;
                this.opacity -= k.dt() * 5;
                if (this.opacity <= 0) k.destroy(this);
              },
            },
          ]);
        }
      }

      if (movingL) facing = -1;
      if (movingR) facing =  1;

      if (bufferT > 0 && onGround) {
        execJump(player, false);
        bufferT = 0;
      }
    });

    function execJump(player, isWall) {
      if (isWall) {
        if (player.vel) {
          player.vel.y = -WALL_JUMP_Y;
          player.vel.x = -wallDir * WALL_JUMP_X;
        }
        wallDir = 0;
        k.play("notify", { volume: 0.3, detune: 80 });
      } else {
        player.jump(JUMP_FORCE);
        jumpsLeft--;
        k.play("notify", { volume: 0.4 });
      }
    }

    k.onKeyPress("x", () => {
      const player = k.get("player")[0];
      if (!player) return;

      if (wallDir !== 0) {
        execJump(player, true);
        return;
      }
      if (coyoteT > 0 || player.isGrounded()) {
        execJump(player, false);
        coyoteT   = 0;
        jumpsLeft = gs.doubleJump ? 1 : 0;
        return;
      }
      if (jumpsLeft > 0 && gs.doubleJump) {
        execJump(player, false);
        for (let i = 0; i < 8; i++) {
          k.add([
            k.rect(3, 3),
            k.pos(player.pos.add(k.vec2(k.rand(-8, 8), k.rand(0, 6)))),
            k.color(255, 195, 50), k.opacity(1), k.z(15),
            {
              v: k.vec2(k.rand(-55, 55), k.rand(-35, 10)),
              update() {
                this.pos = this.pos.add(this.v.scale(k.dt()));
                this.opacity -= k.dt() * 4;
                if (this.opacity <= 0) k.destroy(this);
              },
            },
          ]);
        }
        k.play("notify", { volume: 0.4, detune: 250 });
        return;
      }
      bufferT = JUMP_BUFFER;
    });

    k.onKeyPress("c", () => {
      const player = k.get("player")[0];
      if (!player) return;

      if (!gs.dash) {
        const hint = k.get("abilityHint")[0];
        if (hint) {
          hint.color = k.rgb(255, 70, 70);
          k.wait(0.4, () => { if (hint.exists()) hint.color = k.rgb(155, 155, 155); });
        }
        return;
      }
      if (dashing || dashCD > 0) return;

      dashing = true;
      dashT   = DASH_DURATION;
      dashCD  = DASH_COOLDOWN;

      if (player.vel) {
        player.vel.y = 0;
        player.vel.x = facing * DASH_SPEED;
      }
      k.play("boom", { volume: 0.12, detune: 550 });

      for (let i = 0; i < 5; i++) {
        k.wait(i * 0.025, () => {
          k.add([
            k.sprite("player"),
            k.pos(player.pos.clone()),
            k.opacity(0.35 - i * 0.06),
            k.anchor("center"),
            k.flipX(player.flipX),
            k.z(9),
            {
              update() {
                this.opacity -= k.dt() * 7;
                if (this.opacity <= 0) k.destroy(this);
              },
            },
          ]);
        });
      }
    });
  });
}

async function main() {
  const room1Data = await (await fetch("./maps/room1.json")).json();
  const room2Data = await (await fetch("./maps/room2.json")).json();

  k.scene("room1", (previousSceneData) => {
    room1(k, room1Data, previousSceneData);
    injectMechanics();
  });
  k.scene("room2", (previousSceneData) => {
    room2(k, room2Data, previousSceneData);
    injectMechanics();
  });

  k.scene("final-exit", () => {
    setBackgroundColor(k, "#0a0f1e");
    const meters = Math.floor(gs.maxDepth / 16);
    k.add(
      makeNotificationBox(
        k,
        `You escaped from ${meters}m beneath the surface!\n— The End. Thanks for playing! —`
      )
    );
  });

  // When coming from HTML start screen, go straight to game
  if (window.__FROM_START_SCREEN) {
    k.go("room1", { exitName: null });
  }
}

k.scene("intro", () => {
  setBackgroundColor(k, "#050d1e");

  function spawnDust() {
    k.add([
      k.rect(k.rand(1, 3), k.rand(1, 3)),
      k.pos(k.rand(0, k.width()), k.rand(0, k.height())),
      k.color(60, 130, 220),
      k.opacity(k.rand(0.15, 0.55)),
      k.fixed(), k.z(2),
      {
        v: k.vec2(k.rand(-8, 8), k.rand(12, 35)),
        update() {
          this.pos = this.pos.add(this.v.scale(k.dt()));
          if (this.pos.y > k.height() + 4) k.destroy(this);
        },
      },
    ]);
  }
  for (let i = 0; i < 30; i++) k.wait(k.rand(0, 4), spawnDust);
  k.loop(0.18, spawnDust);

  k.add([
    k.text("BENEATH THE SURFACE", { size: 32, font: "sans-serif" }),
    k.pos(k.width() / 2, k.height() / 2 - 110),
    k.anchor("center"),
    k.color(80, 200, 255),
    k.fixed(), k.z(10),
  ]);

  k.add([
    k.text(
      "Escape the underground factory!\n\n" +
      "← → Arrow Keys  —  Move\n" +
      "X  —  Jump  |  Wall-jump on walls!\n" +
      "Z  —  Attack\n" +
      "C  —  Dash  (unlock by going deeper)\n\n" +
      "New abilities unlock the further you descend.\n" +
      "The darkness grows the deeper you fall.\n\n" +
      "▶  Press ENTER to begin your descent",
      { size: 11, font: "sans-serif", align: "center", width: 460 }
    ),
    k.pos(k.width() / 2, k.height() / 2 + 30),
    k.anchor("center"),
    k.color(170, 205, 240),
    k.fixed(), k.z(10),
  ]);

  k.onKeyPress("enter", () => {
    new AudioContext().resume();
    k.go("room1", { exitName: null });
  });
});

// When from HTML start screen, main() will switch to room1 after scenes load
if (!window.__FROM_START_SCREEN) {
  k.go("intro");
}
main();
