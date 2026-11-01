# Сетки метеоритов и кристаллов

Сгенерированы скриптом `tools/gen_meshes.py`: `python3 tools/gen_meshes.py assets/meshes`.
Как они выглядят — `docs/mockups/assets_showcase.png`.

| Файл | Что | Треугольников |
| --- | --- | --- |
| `meteor_1.obj`, `meteor_2.obj`, `meteor_3.obj` | метеориты, три формы | 1280 |
| `crystal_1.obj`, `crystal_2.obj` | кристаллы | 144, 120 |
| `crystal_base.obj` | камень-подставка под кристалл | 320 |

Цвет и свечение задаются в игре (материал и цвет MeshPart), поэтому одна сетка служит для всех редкостей.
