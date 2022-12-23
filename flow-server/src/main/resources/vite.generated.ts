/**
 * NOTICE: this is an auto-generated file
 *
 * This file has been generated by the `flow:prepare-frontend` maven goal.
 * This file will be overwritten on every run. Any custom changes should be made to vite.config.ts
 */
import path from 'path';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import * as net from 'net';

import { processThemeResources } from '#buildFolder#/plugins/application-theme-plugin/theme-handle.js';
import { rewriteCssUrls } from '#buildFolder#/plugins/theme-loader/theme-loader-utils.js';
import settings from '#settingsImport#';
import { defineConfig, mergeConfig, PluginOption, ResolvedConfig, UserConfigFn, OutputOptions, AssetInfo, ChunkInfo } from 'vite';
import { getManifest } from 'workbox-build';

import * as rollup from 'rollup';
import brotli from 'rollup-plugin-brotli';
import replace from '@rollup/plugin-replace';
import checker from 'vite-plugin-checker';
import postcssLit from '#buildFolder#/plugins/rollup-plugin-postcss-lit-custom/rollup-plugin-postcss-lit.js';

const appShellUrl = '.';

const frontendFolder = path.resolve(__dirname, settings.frontendFolder);
const themeFolder = path.resolve(frontendFolder, settings.themeFolder);
const frontendBundleFolder = path.resolve(__dirname, settings.frontendBundleOutput);
const devBundleFolder = path.resolve(__dirname, settings.devBundleOutput);
const devBundle = !!process.env.devBundle;
const jarResourcesFolder = path.resolve(__dirname, settings.jarResourcesFolder);
const generatedFlowImportsFolder = path.resolve(__dirname, settings.generatedFlowImportsFolder);
const themeResourceFolder = path.resolve(__dirname, settings.themeResourceFolder);
const projectPackageJsonFile = path.resolve(__dirname, 'package.json');

const buildOutputFolder = devBundle ? devBundleFolder : frontendBundleFolder;
const statsFolder = path.resolve(__dirname, devBundle ? settings.devBundleStatsOutput : settings.statsOutput);
const statsFile = path.resolve(statsFolder, 'stats.json');
const nodeModulesFolder = path.resolve(__dirname, 'node_modules');

const projectStaticAssetsFolders = [
  path.resolve(__dirname, 'src', 'main', 'resources', 'META-INF', 'resources'),
  path.resolve(__dirname, 'src', 'main', 'resources', 'static'),
  frontendFolder
];

// Folders in the project which can contain application themes
const themeProjectFolders = projectStaticAssetsFolders.map((folder) => path.resolve(folder, settings.themeFolder));

const themeOptions = {
  devMode: false,
  useDevBundle: devBundle,
  // The following matches folder 'frontend/generated/themes/'
  // (not 'frontend/themes') for theme in JAR that is copied there
  themeResourceFolder: path.resolve(themeResourceFolder, settings.themeFolder),
  themeProjectFolders: themeProjectFolders,
  projectStaticAssetsOutputFolder: devBundle ? path.resolve(devBundleFolder, '../assets') : path.resolve(__dirname, settings.staticOutput),
  frontendGeneratedFolder: path.resolve(frontendFolder, settings.generatedFolder)
};

const hasExportedWebComponents = existsSync(path.resolve(frontendFolder, 'web-component.html'));

// Block debug and trace logs.
console.trace = () => {};
console.debug = () => {};

function injectManifestToSWPlugin(): rollup.Plugin {
  const rewriteManifestIndexHtmlUrl = (manifest) => {
    const indexEntry = manifest.find((entry) => entry.url === 'index.html');
    if (indexEntry) {
      indexEntry.url = appShellUrl;
    }

    return { manifest, warnings: [] };
  };

  return {
    name: 'vaadin:inject-manifest-to-sw',
    async transform(code, id) {
      if (/sw\.(ts|js)$/.test(id)) {
        const { manifestEntries } = await getManifest({
          globDirectory: frontendBundleFolder,
          globPatterns: ['**/*'],
          globIgnores: ['**/*.br'],
          manifestTransforms: [rewriteManifestIndexHtmlUrl],
          maximumFileSizeToCacheInBytes: 100 * 1024 * 1024, // 100mb,
        });

        return code.replace('self.__WB_MANIFEST', JSON.stringify(manifestEntries));
      }
    }
  }
}

function buildSWPlugin(opts): PluginOption {
  let config: ResolvedConfig;
  const devMode = opts.devMode;

  const swObj = {}

  async function build(action: 'generate' | 'write', additionalPlugins: rollup.Plugin[] = []) {
    const includedPluginNames = [
      'alias',
      'vite:resolve',
      'vite:esbuild',
      'rollup-plugin-dynamic-import-variables',
      'vite:esbuild-transpile',
      'vite:terser',
    ]
    const plugins: rollup.Plugin[] = config.plugins.filter((p) => {
      return includedPluginNames.includes(p.name)
    });
    plugins.push(
      replace({
        values: {
          'process.env.NODE_ENV': JSON.stringify(config.mode),
          ...config.define,
        },
        preventAssignment: true
      })
    );
    if (additionalPlugins) {
      plugins.push(...additionalPlugins);
    }
    const bundle = await rollup.rollup({
      input: path.resolve(settings.clientServiceWorkerSource),
      plugins
    });

    try {
      return await bundle[action]({
        file: path.resolve(frontendBundleFolder, 'sw.js'),
        format: 'es',
        exports: 'none',
        sourcemap: config.command === 'serve' || config.build.sourcemap,
        inlineDynamicImports: true,
      });
    } finally {
      await bundle.close();
    }
  }

  return {
    name: 'vaadin:build-sw',
    enforce: 'post',
    async configResolved(resolvedConfig) {
      config = resolvedConfig;
    },
    async buildStart() {
      if (devMode) {
        const { output } = await build('generate');
        swObj.code = output[0].code;
        swObj.map =  output[0].map;
      }
    },
    async load(id) {
      if (id.endsWith('sw.js')) {
        return '';
      }
    },
    async transform(_code, id) {
      if (id.endsWith('sw.js')) {
        return swObj;
      }
    },
    async closeBundle() {
      await build('write', [
        injectManifestToSWPlugin(),
        brotli(),
      ]);
    }
  }
}

function statsExtracterPlugin(): PluginOption {
  return {
    name: 'vaadin:stats',
    enforce: 'post',
    async writeBundle(options: OutputOptions, bundle: { [fileName: string]: AssetInfo | ChunkInfo }) {
      const modules = Object.values(bundle).flatMap((b) => (b.modules ? Object.keys(b.modules) : []));
      const nodeModulesFolders = modules
          .map((id) => id.replace(/\\/g, '/'))
          .filter((id) => id.startsWith(nodeModulesFolder.replace(/\\/g, '/')))
          .map(id => id.substring(nodeModulesFolder.length + 1));
      const npmModules = nodeModulesFolders
        .map((id) => id.replace(/\\/g, '/'))
        .map((id) => {
          const parts = id.split('/');
          if (id.startsWith('@')) {
            return parts[0] + '/' + parts[1];
          } else {
            return parts[0];
          }
        })
        .sort()
        .filter((value, index, self) => self.indexOf(value) === index);
      const npmModuleAndVersion = Object.fromEntries(npmModules.map((module) => [module, getVersion(module)]));

      mkdirSync(path.dirname(statsFile), { recursive: true });
      const projectPackageJson = JSON.parse(readFileSync(projectPackageJsonFile, { encoding: 'utf-8' }));

      const entryScripts = Object.values(bundle).filter(bundle => bundle.isEntry).map(bundle => bundle.fileName);
      //After dev-bundle build add used Flow frontend imports JsModule/JavaScript/CssImport
      const generatedImports = readFileSync(path.resolve(generatedFlowImportsFolder, "generated-flow-imports.js"), {encoding: 'utf-8'})
          .split("\n")
          .filter((line: string) => line.startsWith("import"))
          .map((line: string) => line.substring(line.indexOf("'")+1, line.lastIndexOf("'")));

      const stats = {
        npmModules: projectPackageJson.dependencies,
        handledModules: npmModuleAndVersion,
        bundleImports: generatedImports,
        entryScripts,
        packageJsonHash: projectPackageJson?.vaadin?.hash
      };
      writeFileSync(statsFile, JSON.stringify(stats, null, 1));
    }
  };
}
function vaadinBundlesPlugin(): PluginOption {
  type ExportInfo =
    | string
    | {
        namespace?: string;
        source: string;
      };

  type ExposeInfo = {
    exports: ExportInfo[];
  };

  type PackageInfo = {
    version: string;
    exposes: Record<string, ExposeInfo>;
  };

  type BundleJson = {
    packages: Record<string, PackageInfo>;
  };

  const disabledMessage = 'Vaadin component dependency bundles are disabled.';

  const modulesDirectory = nodeModulesFolder.replace(/\\/g, '/');

  let vaadinBundleJson: BundleJson;

  function parseModuleId(id: string): { packageName: string; modulePath: string } {
    const [scope, scopedPackageName] = id.split('/', 3);
    const packageName = scope.startsWith('@') ? `${scope}/${scopedPackageName}` : scope;
    const modulePath = `.${id.substring(packageName.length)}`;
    return {
      packageName,
      modulePath
    };
  }

  function getExports(id: string): string[] | undefined {
    const { packageName, modulePath } = parseModuleId(id);
    const packageInfo = vaadinBundleJson.packages[packageName];

    if (!packageInfo) return;

    const exposeInfo: ExposeInfo = packageInfo.exposes[modulePath];
    if (!exposeInfo) return;

    const exportsSet = new Set<string>();
    for (const e of exposeInfo.exports) {
      if (typeof e === 'string') {
        exportsSet.add(e);
      } else {
        const { namespace, source } = e;
        if (namespace) {
          exportsSet.add(namespace);
        } else {
          const sourceExports = getExports(source);
          if (sourceExports) {
            sourceExports.forEach((e) => exportsSet.add(e));
          }
        }
      }
    }
    return Array.from(exportsSet);
  }

  function getExportBinding(binding: string) {
    return binding === 'default' ? '_default as default' : binding;
  }

  function getImportAssigment(binding: string) {
    return binding === 'default' ? 'default: _default' : binding;
  }

  return {
    name: 'vaadin:bundles',
    enforce: 'pre',
    apply(config, { command }) {
      if (command !== 'serve') return false;

      try {
        const vaadinBundleJsonPath = require.resolve('@vaadin/bundles/vaadin-bundle.json');
        vaadinBundleJson = JSON.parse(readFileSync(vaadinBundleJsonPath, { encoding: 'utf8' }));
      } catch (e: unknown) {
        if (typeof e === 'object' && (e as { code: string }).code === 'MODULE_NOT_FOUND') {
          vaadinBundleJson = { packages: {} };
          console.info(`@vaadin/bundles npm package is not found, ${disabledMessage}`);
          return false;
        } else {
          throw e;
        }
      }

      const versionMismatches: Array<{ name: string; bundledVersion: string; installedVersion: string }> = [];
      for (const [name, packageInfo] of Object.entries(vaadinBundleJson.packages)) {
        let installedVersion: string | undefined = undefined;
        try {
          const { version: bundledVersion } = packageInfo;
          const installedPackageJsonFile = path.resolve(modulesDirectory, name, 'package.json');
          const packageJson = JSON.parse(readFileSync(installedPackageJsonFile, { encoding: 'utf8' }));
          installedVersion = packageJson.version;
          if (installedVersion && installedVersion !== bundledVersion) {
            versionMismatches.push({
              name,
              bundledVersion,
              installedVersion
            });
          }
        } catch (_) {
          // ignore package not found
        }
      }
      if (versionMismatches.length) {
        console.info(`@vaadin/bundles has version mismatches with installed packages, ${disabledMessage}`);
        console.info(`Packages with version mismatches: ${JSON.stringify(versionMismatches, undefined, 2)}`);
        vaadinBundleJson = { packages: {} };
        return false;
      }

      return true;
    },
    async config(config) {
      return mergeConfig(
        {
          optimizeDeps: {
            exclude: [
              // Vaadin bundle
              '@vaadin/bundles',
              ...Object.keys(vaadinBundleJson.packages)
            ]
          }
        },
        config
      );
    },
    load(rawId) {
      const [path, params] = rawId.split('?');
      if (!path.startsWith(modulesDirectory)) return;

      const id = path.substring(modulesDirectory.length + 1);
      const bindings = getExports(id);
      if (bindings === undefined) return;

      const cacheSuffix = params ? `?${params}` : '';
      const bundlePath = `@vaadin/bundles/vaadin.js${cacheSuffix}`;

      return `import { init as VaadinBundleInit, get as VaadinBundleGet } from '${bundlePath}';
await VaadinBundleInit('default');
const { ${bindings.map(getImportAssigment).join(', ')} } = (await VaadinBundleGet('./node_modules/${id}'))();
export { ${bindings.map(getExportBinding).join(', ')} };`;
    }
  };
}

function themePlugin(opts): PluginOption {
  const fullThemeOptions = {...themeOptions, devMode: opts.devMode };
  return {
    name: 'vaadin:theme',
    config() {
      processThemeResources(fullThemeOptions, console);
    },
    configureServer(server) {
      function handleThemeFileCreateDelete(themeFile, stats) {
        if (themeFile.startsWith(themeFolder)) {
          const changed = path.relative(themeFolder, themeFile)
          console.debug('Theme file ' + (!!stats ? 'created' : 'deleted'), changed);
          processThemeResources(fullThemeOptions, console);
        }
      }
      server.watcher.on('add', handleThemeFileCreateDelete);
      server.watcher.on('unlink', handleThemeFileCreateDelete);
    },
    handleHotUpdate(context) {
      const contextPath = path.resolve(context.file);
      const themePath = path.resolve(themeFolder);
      if (contextPath.startsWith(themePath)) {
        const changed = path.relative(themePath, contextPath);

        console.debug('Theme file changed', changed);

        if (changed.startsWith(settings.themeName)) {
          processThemeResources(fullThemeOptions, console);
        }
      }
    },
    async resolveId(id, importer) {
      // force theme generation if generated theme sources does not yet exist
      // this may happen for example during Java hot reload when updating
      // @Theme annotation value
      if (path.resolve(themeOptions.frontendGeneratedFolder, "theme.js") === importer &&
            !existsSync(path.resolve(themeOptions.frontendGeneratedFolder, id))) {
          console.debug('Generate theme file ' + id + ' not existing. Processing theme resource');
          processThemeResources(fullThemeOptions, console);
          return;
      }
      if (!id.startsWith(settings.themeFolder)) {
        return;
      }

      for (const location of [themeResourceFolder, frontendFolder]) {
        const result = await this.resolve(path.resolve(location, id));
        if (result) {
          return result;
        }
      }
    },
    async transform(raw, id, options) {
      // rewrite urls for the application theme css files
      const [bareId, query] = id.split('?');
      if (!bareId?.startsWith(themeFolder) || !bareId?.endsWith('.css')) {
        return;
      }
      const [themeName] = bareId.substring(themeFolder.length + 1).split('/');
      return rewriteCssUrls(raw, path.dirname(bareId), path.resolve(themeFolder, themeName), console, opts);
    }
  };
}
function lenientLitImportPlugin(): PluginOption {
  return {
    name: 'vaadin:lenient-lit-import',
    async transform(code, id) {
      const decoratorImports = [
        /import (.*?) from (['"])(lit\/decorators)(['"])/,
        /import (.*?) from (['"])(lit-element\/decorators)(['"])/
      ];
      const directiveImports = [
        /import (.*?) from (['"])(lit\/directives\/)([^\\.]*?)(['"])/,
        /import (.*?) from (['"])(lit-html\/directives\/)([^\\.]*?)(['"])/
      ];

      decoratorImports.forEach((decoratorImport) => {
        let decoratorMatch;
        while ((decoratorMatch = code.match(decoratorImport))) {
          console.warn(
            `Warning: the file ${id} imports from '${decoratorMatch[3]}' when it should import from '${decoratorMatch[3]}.js'`
          );
          code = code.replace(decoratorImport, 'import $1 from $2$3.js$4');
        }
      });

      directiveImports.forEach((directiveImport) => {
        let directiveMatch;
        while ((directiveMatch = code.match(directiveImport))) {
          console.warn(
            `Warning: the file ${id} imports from '${directiveMatch[3]}${directiveMatch[4]}' when it should import from '${directiveMatch[3]}${directiveMatch[4]}.js'`
          );
          code = code.replace(directiveImport, 'import $1 from $2$3$4.js$5');
        }
      });

      return code;
    }
  };
}

function runWatchDog(watchDogPort, watchDogHost) {
  const client = net.Socket();
  client.setEncoding('utf8');
  client.on('error', function (err) {
    console.log('Watchdog connection error. Terminating vite process...', err);
    client.destroy();
    process.exit(0);
  });
  client.on('close', function () {
    client.destroy();
    runWatchDog(watchDogPort, watchDogHost);
  });

  client.connect(watchDogPort, watchDogHost || 'localhost');
}

let spaMiddlewareForceRemoved = false;

const allowedFrontendFolders = [
  frontendFolder,
  path.resolve(generatedFlowImportsFolder), // Contains only generated-flow-imports
  nodeModulesFolder
];

function setHmrPortToServerPort(): PluginOption {
  return {
    name: 'set-hmr-port-to-server-port',
    configResolved(config) {
      if (config.server.strictPort && config.server.hmr !== false) {
        if (config.server.hmr === true) config.server.hmr = {};
        config.server.hmr = config.server.hmr || {};
        config.server.hmr.clientPort = config.server.port;
      }
    }
  };
}
function showRecompileReason(): PluginOption {
  return {
    name: 'vaadin:why-you-compile',
    handleHotUpdate(context) {
      console.log('Recompiling because', context.file, 'changed');
    }
  };
}

export const vaadinConfig: UserConfigFn = (env) => {
  const devMode = env.mode === 'development';

  if (devMode && process.env.watchDogPort) {
    // Open a connection with the Java dev-mode handler in order to finish
    // vite when it exits or crashes.
    runWatchDog(process.env.watchDogPort, process.env.watchDogHost);
  }

  return {
    root: frontendFolder,
    base: '',
    resolve: {
      alias: {
        '@vaadin/flow-frontend': jarResourcesFolder,
        Frontend: frontendFolder
      },
      preserveSymlinks: true
    },
    define: {
      OFFLINE_PATH: settings.offlinePath,
      VITE_ENABLED: 'true'
    },
    server: {
      host: '127.0.0.1',
      strictPort: true,
      fs: {
        allow: allowedFrontendFolders
      }
    },
    build: {
      outDir: buildOutputFolder,
      emptyOutDir: devBundle,
      assetsDir: 'VAADIN/build',
      rollupOptions: {
        input: {
          indexhtml: path.resolve(frontendFolder, 'index.html'),

          ...hasExportedWebComponents
            ? { webcomponenthtml: path.resolve(frontendFolder, 'web-component.html') }
            : {}
        }
      }
    },
    optimizeDeps: {
      entries: [
        // Pre-scan entrypoints in Vite to avoid reloading on first open
        'generated/vaadin.ts'
      ],
      exclude: [
        '@vaadin/router',
        '@vaadin/vaadin-license-checker',
        '@vaadin/vaadin-usage-statistics',
        'workbox-core',
        'workbox-precaching',
        'workbox-routing',
        'workbox-strategies'
      ]
    },
    plugins: [
      !devMode && brotli(),
      devMode && vaadinBundlesPlugin(),
      devMode && setHmrPortToServerPort(),
      devMode && showRecompileReason(),
      settings.offlineEnabled && buildSWPlugin({ devMode }),
      !devMode && statsExtracterPlugin(),
      themePlugin({devMode}),
      lenientLitImportPlugin(),
      postcssLit({
        include: ['**/*.css', '**/*.css\?*'],
        exclude: [
          `${themeFolder}/**/*.css`,
          `${themeFolder}/**/*.css\?*`,
          `${themeResourceFolder}/**/*.css`,
          `${themeResourceFolder}/**/*.css\?*`,
          '**/*\?html-proxy*'
        ]
      }),
      {
        name: 'vaadin:force-remove-html-middleware',
        transformIndexHtml: {
          enforce: 'pre',
          transform(_html, { server }) {
            if (server && !spaMiddlewareForceRemoved) {
              server.middlewares.stack = server.middlewares.stack.filter((mw) => {
                const handleName = '' + mw.handle;
                return !handleName.includes('viteHtmlFallbackMiddleware');
              });
              spaMiddlewareForceRemoved = true;
            }
          }
        }
      },
      hasExportedWebComponents && {
        name: 'vaadin:inject-entrypoints-to-web-component-html',
        transformIndexHtml: {
          enforce: 'pre',
          transform(_html, { path, server }) {
            if (path !== '/web-component.html') {
              return;
            }

            return [
              {
                tag: 'script',
                attrs: { type: 'module', src: `/generated/vaadin-web-component.ts` },
                injectTo: 'head'
              }
            ]
          }
        }
      },
      {
        name: 'vaadin:inject-entrypoints-to-index-html',
        transformIndexHtml: {
          enforce: 'pre',
          transform(_html, { path, server }) {
            if (path !== '/index.html') {
              return;
            }

            const scripts = [];

            if (devMode) {
              scripts.push({
                tag: 'script',
                attrs: { type: 'module', src: `/generated/vite-devmode.ts` },
                injectTo: 'head'
              });
            }
            scripts.push({
              tag: 'script',
              attrs: { type: 'module', src: '/generated/vaadin.ts' },
              injectTo: 'head'
            });
            return scripts;
          }
        }
      },
      checker({
        typescript: true
      })
    ]
  };
};

export const overrideVaadinConfig = (customConfig: UserConfigFn) => {
  return defineConfig((env) => mergeConfig(vaadinConfig(env), customConfig(env)));
};
function getVersion(module: string):string {
  const packageJson = path.resolve(nodeModulesFolder, module, 'package.json');
  return JSON.parse(readFileSync(packageJson, {encoding: 'utf-8'})).version;
}

