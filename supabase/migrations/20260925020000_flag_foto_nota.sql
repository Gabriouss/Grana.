-- Interruptor remoto da foto da nota (leitura do valor total por OCR no aparelho).
-- Nasce ligado, como todos os outros: a chave existir no banco é o que permite
-- desligá-la em segundos se o reconhecimento entrar em instabilidade. Sem a
-- linha, `ligado('foto_nota')` cai no caminho "desconhecida = ligada".
insert into feature_flags (key, enabled) values ('foto_nota', true)
on conflict (key) do nothing;
