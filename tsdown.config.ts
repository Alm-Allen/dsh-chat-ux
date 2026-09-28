import { defineConfig } from 'tsdown'

/**
 * dsh-chat-ux 构建配置。
 *
 * 用 DSH 自己的客户端构建器 tsdown（DSH 各包的 `"bundle": "tsdown"` 就是它；安装版里 69 个包这么写）：
 *
 *   host    src/index.ts         -> dist/index.js  + dist/index.d.ts
 *   client  src/client/index.tsx -> dist/client.js（声明另出，见下）
 *
 * 客户端那一半必须包成客户端模块加载器要求的单文件 factory 形式。加载器是这么调它的：
 *
 *   exports: registered.factory(this.makeRequire(ownerId, edges))
 *
 * 也就是**用 factory 的返回值**当模块导出，而不看 `module.exports`。所以外壳必须自己声明
 * `module` / `exports`、并在末尾 `return module.exports`——只包 `(require) => {` 会让产物里的
 * 裸 `exports` 变成未定义引用。DSH 自己的产物（如 dsh-api-gateway/lib/client.js）正是这个形状。
 *
 * 基座模块由页面在运行时提供，必须外置：打进 bundle 会拿到第二份 React，而 primitives 自带的
 * CSS Modules 还会被当成内部依赖去解析（实测直接构建失败）。
 *
 * **客户端那一半刻意不在这里出声明文件。** banner/footer 是加在 chunk 上的，声明产物也会被裹
 * 进去，于是 `dist/client.d.ts` 开头变成加载器外壳、不再是合法模块（`tsc` 报 TS2306）。声明改由
 * `npm run build:types` 用裸 tsc 生成——与改动前的流水线一致。
 */
const CLIENT_ID = '@alm-allen/dsh-chat-ux'

/** 页面基座表提供的模块，一律外置。 */
const PLATFORM_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    outDir: 'dist',
    format: 'esm',
    platform: 'node',
    dts: true,
    // package.json 的 main/types 指着 dist/index.js 与 dist/index.d.ts，
    // 所以固定后缀，不让它按格式加 .mjs / .d.mts。
    outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
    clean: true,
  },
  {
    entry: { client: 'src/client/index.tsx' },
    outDir: 'dist',
    format: 'cjs',
    platform: 'browser',
    // 见文件头：声明由 build:types 用裸 tsc 出，不走 banner/footer。
    dts: false,
    // 产物名由 exports["./client"] 决定，必须是 client.js（不能是 client.cjs）。
    outExtensions: () => ({ js: '.js' }),
    clean: false,
    deps: { neverBundle: PLATFORM_EXTERNALS },
    banner: `window.__ModuleLoader__.load({
  id: "${CLIENT_ID}",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;`,
    footer: `    return module.exports;
  }
});`,
  },
])
