/// <reference types="vite/client" />

// 权利声明页脚用的投诉邮箱（手册 §4.2 第 5 条），通过 .env 里 VITE_COMPLAINT_EMAIL 注入
interface ImportMetaEnv {
  readonly VITE_COMPLAINT_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
