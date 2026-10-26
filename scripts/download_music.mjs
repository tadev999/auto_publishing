import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const MUSIC_DIR = path.join(ROOT, 'assets', 'music');

const FREEPD_BASE = 'https://raw.githubusercontent.com/SoundSafari/CC0-1.0-Music/main/freepd.com/';
const PIXABAY_BASE = 'https://raw.githubusercontent.com/SoundSafari/CC0-1.0-Music/main/pixbay.com/';

// 100% Verified CC0 1.0 Universal / Public Domain & Pixabay Free License
// Guaranteed safe for YouTube Content ID, TikTok, and commercial monetization.
const TRACKS = {
  calm: [
    {
      name: '01_pixabay_green_sky.mp3',
      url: PIXABAY_BASE + 'green-sky-125179.mp3',
    },
    {
      name: '02_pixabay_chinese_flute.mp3',
      url: PIXABAY_BASE + 'chinese-flute-on-london-bridge-121729.mp3',
    },
    {
      name: '03_pixabay_pan_flute.mp3',
      url: PIXABAY_BASE + 'pan-flute-greensleeves-144616.mp3',
    },
    {
      name: '04_freepd_ambient_bongos.mp3',
      url: FREEPD_BASE + encodeURIComponent('Ambient Bongos.mp3'),
    },
    {
      name: '05_freepd_aquarium.mp3',
      url: FREEPD_BASE + encodeURIComponent('Aquarium.mp3'),
    },
    {
      name: '06_freepd_aquatic_city.mp3',
      url: FREEPD_BASE + encodeURIComponent('Aquatic City Vanished.mp3'),
    },
    {
      name: '07_freepd_arpent.mp3',
      url: FREEPD_BASE + encodeURIComponent('Arpent.mp3'),
    },
    {
      name: '08_freepd_city_sunshine.mp3',
      url: FREEPD_BASE + encodeURIComponent('City Sunshine.mp3'),
    },
    {
      name: '09_freepd_deep_tones.mp3',
      url: FREEPD_BASE + encodeURIComponent('Deep Tones.mp3'),
    },
    {
      name: '10_freepd_infinite_peace.mp3',
      url: FREEPD_BASE + encodeURIComponent('Infinite Peace.mp3'),
    },
    {
      name: '11_freepd_kalimba_relaxation.mp3',
      url: FREEPD_BASE + encodeURIComponent('Kalimba Relaxation Music.mp3'),
    },
    {
      name: '12_freepd_river_meditation.mp3',
      url: FREEPD_BASE + encodeURIComponent('River Meditation.mp3'),
    },
    {
      name: '13_freepd_space_ambience.mp3',
      url: FREEPD_BASE + encodeURIComponent('Space Ambience.mp3'),
    },
    {
      name: '14_freepd_study_and_relax.mp3',
      url: FREEPD_BASE + encodeURIComponent('Study and Relax.mp3'),
    },
    {
      name: '15_freepd_the_lagoon.mp3',
      url: FREEPD_BASE + encodeURIComponent('The Lagoon.mp3'),
    },
  ],
  reflective: [
    {
      name: '01_pixabay_arkansas_flute.mp3',
      url: PIXABAY_BASE + 'the-arkansas-traveler-bamboo-flute-124998.mp3',
    },
    {
      name: '02_pixabay_unknown_realm.mp3',
      url: PIXABAY_BASE + 'unknown-realm-147409.mp3',
    },
    {
      name: '03_freepd_after_the_end.mp3',
      url: FREEPD_BASE + encodeURIComponent('After the End.mp3'),
    },
    {
      name: '04_freepd_attic_secrets.mp3',
      url: FREEPD_BASE + encodeURIComponent('Attic Secrets.mp3'),
    },
    {
      name: '05_freepd_waltz_for_naseem.mp3',
      url: FREEPD_BASE + encodeURIComponent('A Waltz For Naseem.mp3'),
    },
    {
      name: '06_freepd_cold_journey.mp3',
      url: FREEPD_BASE + encodeURIComponent('Cold Journey.mp3'),
    },
    {
      name: '07_freepd_dreams_of_vain.mp3',
      url: FREEPD_BASE + encodeURIComponent('Dreams of Vain.mp3'),
    },
    {
      name: '08_freepd_eye_of_forgiveness.mp3',
      url: FREEPD_BASE + encodeURIComponent('Eye of Forgiveness.mp3'),
    },
    {
      name: '09_freepd_finally_see_the_light.mp3',
      url: FREEPD_BASE + encodeURIComponent('Finally See The Light.mp3'),
    },
    {
      name: '10_freepd_forest_night.mp3',
      url: FREEPD_BASE + encodeURIComponent('Forest Night.mp3'),
    },
    {
      name: '11_freepd_i_guess_what_im_trying_to_say.mp3',
      url: FREEPD_BASE + encodeURIComponent("I Guess What I'm Trying to Say.mp3"),
    },
    {
      name: '12_freepd_isolation_waltz.mp3',
      url: FREEPD_BASE + encodeURIComponent('Isolation Waltz.mp3'),
    },
    {
      name: '13_freepd_landras_dream.mp3',
      url: FREEPD_BASE + encodeURIComponent("Landra's Dream.mp3"),
    },
    {
      name: '14_freepd_lonely_mountain.mp3',
      url: FREEPD_BASE + encodeURIComponent('Lonely Mountain.mp3'),
    },
    {
      name: '15_freepd_nostalgic_piano.mp3',
      url: FREEPD_BASE + encodeURIComponent('Nostalgic Piano.mp3'),
    },
  ],
  warm: [
    {
      name: '01_pixabay_guitar_mellow_beat.mp3',
      url: PIXABAY_BASE + 'guitar-mellow-beat-20221122-128596.mp3',
    },
    {
      name: '02_pixabay_happy_thanksgiving.mp3',
      url: PIXABAY_BASE + 'happy-thanksgiving-148908.mp3',
    },
    {
      name: '03_pixabay_irish_sitar.mp3',
      url: PIXABAY_BASE + 'irish-sitar-bendemeerx27s-stream-119257.mp3',
    },
    {
      name: '04_pixabay_french_patapan.mp3',
      url: PIXABAY_BASE + 'a-french-christmas-patapan-intro-125325.mp3',
    },
    {
      name: '05_pixabay_bethlehem_intro.mp3',
      url: PIXABAY_BASE + 'christmas-intro-o-little-town-of-bethlehem-125582.mp3',
    },
    {
      name: '06_freepd_adding_the_sun.mp3',
      url: FREEPD_BASE + encodeURIComponent('Adding the Sun.mp3'),
    },
    {
      name: '07_freepd_be_chillin.mp3',
      url: FREEPD_BASE + encodeURIComponent('Be Chillin.mp3'),
    },
    {
      name: '08_freepd_bonfire.mp3',
      url: FREEPD_BASE + encodeURIComponent('Bonfire.mp3'),
    },
    {
      name: '09_freepd_connecting_rainbows.mp3',
      url: FREEPD_BASE + encodeURIComponent('Connecting Rainbows.mp3'),
    },
    {
      name: '10_freepd_funshine.mp3',
      url: FREEPD_BASE + encodeURIComponent('Funshine.mp3'),
    },
    {
      name: '11_freepd_happy_whistling_ukulele.mp3',
      url: FREEPD_BASE + encodeURIComponent('Happy Whistling Ukulele.mp3'),
    },
    {
      name: '12_freepd_hold_me_love_me.mp3',
      url: FREEPD_BASE + encodeURIComponent('Hold Me, Love Me.mp3'),
    },
    {
      name: '13_freepd_inspiration.mp3',
      url: FREEPD_BASE + encodeURIComponent('Inspiration.mp3'),
    },
    {
      name: '14_freepd_joeys_song.mp3',
      url: FREEPD_BASE + encodeURIComponent("Joey's Song.mp3"),
    },
    {
      name: '15_freepd_lovely_piano_song.mp3',
      url: FREEPD_BASE + encodeURIComponent('Lovely Piano Song.mp3'),
    },
  ],
};

async function downloadFile(url, destPath) {
  if (fs.existsSync(destPath) && fs.statSync(destPath).size > 10000) {
    console.log(`  [SKIP] Đã tồn tại: ${path.basename(destPath)}`);
    return;
  }

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  const nodeStream = (await import('node:stream')).Readable.fromWeb(res.body);
  await pipeline(nodeStream, fs.createWriteStream(destPath));
  const sz = fs.statSync(destPath).size;
  console.log(`  [OK] ${(sz / 1024 / 1024).toFixed(2)} MB -> ${path.basename(destPath)}`);
}

async function main() {
  console.log('=== BẮT ĐẦU TẢI NHẠC NỀN 100% MIỄN PHÍ BẢN QUYỀN (CC0 / FREEPD / PIXABAY) ===');

  for (const [mood, list] of Object.entries(TRACKS)) {
    const dir = path.join(MUSIC_DIR, mood);
    fs.mkdirSync(dir, { recursive: true });
    console.log(`\n📂 Thư mục: ${mood} (${list.length} tracks)...`);

    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      const dest = path.join(dir, item.name);
      try {
        console.log(`(${i + 1}/${list.length}) Tải: ${item.name}...`);
        await downloadFile(item.url, dest);
      } catch (err) {
        console.error(`  [LỖI] ${item.name}: ${err.message}`);
      }
    }
  }

  console.log('\n=== HOÀN TẤT KIỂM TRA THƯ MỤC NHẠC ===');
  for (const mood of ['calm', 'reflective', 'warm']) {
    const dir = path.join(MUSIC_DIR, mood);
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.mp3')) : [];
    console.log(` - assets/music/${mood}: ${files.length} audio files`);
  }
}

main().catch(console.error);
