# Кирпичные модели (стиль «блоки с пупырками»)

Сгенерированы скриптом `tools/gen_bricks.py`: `python3 tools/gen_bricks.py assets/bricks`.
Как выглядят — `docs/mockups/brick_style.png`.

Формат `.glb`: цвета блоков хранятся в вершинах (в OBJ так нельзя). В каждом файле две сетки:
- `Body` — обычные блоки, цвет из вершин;
- `Glow` — светящиеся блоки (трещины метеорита, сам кристалл). В игре им ставится материал Neon и цвет редкости.

| Файл | Откуда |
| --- | --- |
| `brick_meteor_small.glb`, `brick_meteor_medium.glb`, `brick_meteor_large.glb` | `tools/gen_bricks.py` |
| `brick_crystal.glb` | `tools/gen_bricks.py` |
| `legendary_meteor.glb` | `assets/vox/legendary_meteor.vox` → `tools/vox2glb.py` (сам `.vox` сделан `tools/models/hero_meteor.py`) |

Конвертер из MagicaVoxel: `python3 tools/vox2glb.py assets/vox/<имя>.vox assets/bricks/<имя>.glb`. Он предупреждает, если в сетке больше ~20 000 треугольников.

Не проверено в Studio: сохранит ли импорт цвета вершин. Проверить при первом импорте.
