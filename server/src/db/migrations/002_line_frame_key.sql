-- 台词缩略图：管线截帧上传 R2 后写入对象键；列表/蒙版用预签名 JPEG，不再依赖 <video> 跨域 seek。
ALTER TABLE lines ADD COLUMN IF NOT EXISTS frame_key TEXT;
