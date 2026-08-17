const { withSettingsGradle } = require('expo/config-plugins');

/**
 * O Expo usa `expo.name` em dois lugares no Android: como rótulo exibido sob
 * o ícone (app_name) e como `rootProject.name` no settings.gradle. O Gradle
 * recusa nomes de projeto que começam ou terminam com ponto, então o nome da
 * marca "Grana." quebra o build nativo com:
 *
 *   The project name 'Grana.' must not start or end with a '.'
 *
 * Este plugin reescreve apenas o `rootProject.name` para uma versão sem
 * pontuação. O rótulo visível ao usuário continua vindo de `expo.name`, ou
 * seja, o "Grana." aparece normalmente na tela inicial do celular.
 */
const withGradleSafeProjectName = (config) =>
  withSettingsGradle(config, (cfg) => {
    const seguro = (config.name || 'app').replace(/^[.]+|[.]+$/g, '').trim() || 'app';
    const padrao = /rootProject\.name\s*=\s*(['"]).*?\1/;

    if (!padrao.test(cfg.modResults.contents)) {
      // Falha explícita: se o Expo mudar o formato do settings.gradle,
      // é melhor quebrar aqui do que gerar um projeto nativo inválido.
      throw new Error(
        '[withGradleSafeProjectName] Não encontrei "rootProject.name" no settings.gradle gerado.'
      );
    }

    cfg.modResults.contents = cfg.modResults.contents.replace(
      padrao,
      `rootProject.name = '${seguro}'`
    );
    return cfg;
  });

module.exports = withGradleSafeProjectName;
