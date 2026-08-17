# Backup dos ícones anteriores

Cópia exata dos PNGs que estavam em `assets/` antes da regeneração a partir dos
vetores canônicos de `design-system/marca/` (16/08/2026).

Esses arquivos não são importados por nada — Metro só empacota assets que algum
módulo referencia, e nenhum destes é referenciado. A pasta existe só como ponto
de retorno.

Para reverter: copie os PNGs daqui de volta para `assets/`, sobrescrevendo.

O que mudou na regeneração:

- O símbolo do foreground Android passou a caber nos 675 px centrais de 1024
  (zona segura de 66%), que é o que impede o corte em launchers redondos.
- Os dois escuros que circulavam na identidade (`#09384a` nos ícones e
  `#08384b` nos logotipos) foram unificados em `#052229`, o mesmo de
  `theme.paper` e do `adaptiveIcon.backgroundColor` em `app.json`.
- `icon.png` virou full-bleed quadrado e opaco: o iOS aplica a própria máscara,
  então cantos arredondados no arquivo produziriam arredondamento duplo.
- `favicon.png` foi rasterizado direto em 48×48 a partir do vetor, sem
  reamostragem.
