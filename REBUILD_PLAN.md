# 后端
cd /Users/jaclyn/Desktop/train_model/backend
.venv/bin/uvicorn app.main:app --reload --port 8000

# 前端
cd /Users/jaclyn/Desktop/train_model/frontend
npm run dev



# 算法训练平台 — React + FastAPI 重构方案

> 基于 prototype/ 目录下 14 个 HTML 页面的完整分析
> 2026-07-24

---

## 一、现有系统概况

### 技术现状
- 纯 HTML + CSS + vanilla JS
- 数据全部存 localStorage，无后端
- 设计风格与 Ant Design 一致

### 页面清单

| 页面 | 功能 | 复杂度 |
|---|---|---|
| login.html | 登录/注册，含角色（管理员、算法工程师、标注人员、客户） | 低 |
| my_projects.html | 个人算法管理（CRUD），可共享到团队 | 中 |
| projects.html | 团队算法总览，Pipeline 状态卡片（数据→标注→训练→评估→部署→迭代） | 中 |
| data_center.html | 文件上传、抽帧、去重、数据集划分、自动标注 | 高 |
| annotation.html | Canvas 标注工作台（画框、标签管理、翻页、预标注审核） | **最高** |
| training.html | 训练配置（超参、数据增强）、实时监控（Loss/mAP 曲线、日志） | 高 |
| evaluation.html | 模型评估：mAP、PR 曲线、混淆矩阵、各类别精度 | 中 |
| trial.html | 模型试用：上传图片/视频推理 | 中 |
| deployment.html | 部署包生成（.pt + detect.py → ZIP） | 低 |
| models.html | 全局模型总览，批量导入/导出 | 中 |
| models_use.html | 跨算法模型推理使用 | 低（功能与 trial 重叠） |
| training_queue.html | 训练队列管理（排队、暂停/继续/终止、调度） | 中 |
| team_manage.html | 团队 CRUD + 成员管理（角色/权限） | 中 |
| profile.html | 个人资料编辑、改密码 | 低 |

---

## 二、技术栈选择

### 前端

| 类别 | 选型 | 理由 |
|---|---|---|
| 框架 | React 18+ | 生态成熟，适合数据密集型后台管理 |
| 语言 | TypeScript | openapi-typescript 从后端自动生成类型 |
| 构建工具 | Vite | 快 |
| UI 组件库 | **Ant Design 5** | 原型设计语言与 Ant Design 完全一致 |
| 路由 | React Router v6 | |
| 状态管理 | Zustand + TanStack Query (React Query) | 服务端状态用 React Query，客户端状态用 Zustand |
| Canvas 标注 | Fabric.js 或 Konva.js | annotation 工作台的核心依赖 |
| 图表 | ECharts 或 Recharts | 训练曲线、评估图表 |
| HTTP | Axios | 拦截器、文件上传进度 |

### 后端

| 类别 | 选型 | 理由 |
|---|---|---|
| 框架 | **FastAPI** | Python 原生，可直接 `from ultralytics import YOLO`，零桥接成本；自动生成 Swagger 文档 |
| 语言 | Python 3.11+ | YOLO/ultralytics、numpy、opencv 全是 Python 生态 |
| ORM | **SQLAlchemy + SQLModel** | SQLModel 结合了 SQLAlchemy 的强大 + Pydantic 的类型校验，和 FastAPI 无缝集成 |
| 数据库 | **PostgreSQL** | 用户、团队、项目、标注、模型元数据 |
| 异步队列 | **arq** (Redis) 或 FastAPI BackgroundTasks | 训练等长任务异步执行；轻量任务直接用 BackgroundTasks |
| 文件存储 | **MinIO** (S3 兼容) 或本地文件系统 | 图片、视频、模型权重 (.pt)、训练产物 |
| 前端类型生成 | **openapi-typescript** | 从 FastAPI 的 OpenAPI schema 自动生成 TypeScript 类型，替代手动维护共享类型包 |

### 为什么选 FastAPI 而不是 NestJS

- **训练必须用 Python**——ultralytics、torch、numpy 全是 Python 生态，FastAPI 可以直接调用，不需要消息队列桥接 Node.js 和 Python 两个进程
- **一个人全栈**——前后端都是 TypeScript 看起来美好，但实际要在 Node.js 和 Python 两套环境之间切来切去。FastAPI 一把梭，后端逻辑和训练脚本同语言、同进程
- **自动文档**——FastAPI 的 Swagger + ReDoc 是业界最佳，前端对着自动生成的文档写接口调用
- **类型安全不丢**——FastAPI 的 Pydantic schema 可以通过 openapi-typescript 自动生成前端 TypeScript 类型，不用手动维护共享类型包

---

## 三、架构

### 代码组织（Monorepo）

```
algorithm/                       ← 一个 Git 仓库
├── prototype/                   ← 已有原型（保留参考）
├── frontend/                    ← React + Vite + Ant Design
├── backend/                     ← FastAPI + SQLAlchemy + SQLModel
│   ├── app/
│   │   ├── api/                 ← 路由
│   │   ├── models/              ← SQLAlchemy 模型
│   │   ├── schemas/             ← Pydantic DTO
│   │   ├── services/            ← 业务逻辑（含直接调 ultralytics）
│   │   └── core/                ← 配置、JWT、依赖注入
│   ├── alembic/                 ← 数据库迁移
│   └── requirements.txt
└── (前端类型由 openapi-typescript 从 /openapi.json 自动生成，
     不手动维护 shared/ 包)
```

> **Monorepo 就是所有代码放一个 Git 仓库，不建多个仓库。**
> `git push` 一下前后端一起上去。

### 系统架构

```
┌───────────────────────────────────────────────┐
│            Frontend (React)                    │
│   Ant Design + Vite + React Router + TQ        │
└──────────────────┬────────────────────────────┘
                   │ REST API (JSON) + 自动生成 Swagger 文档
┌──────────────────▼────────────────────────────┐
│            Backend (FastAPI)                    │
│  Auth (JWT) · CRUD · File Upload · RBAC        │
│  + 直接调用 ultralytics 训练/评估/推理           │
└──────┬──────────────────┬─────────────────────┘
       │ SQLAlchemy        │ arq / BackgroundTasks
┌──────▼──────┐    ┌───────▼──────────┐
│ PostgreSQL  │    │   Redis (arq)     │
│  (元数据)    │    │  (可选，轻量任务   │
└─────────────┘    │   用 Background)   │
                   └──────────────────┘
┌───────────────────────────────────────────────┐
│        MinIO / Local FS                       │
│    (图片·视频·.pt 模型·训练产物·部署包)          │
└───────────────────────────────────────────────┘
```

> 与 NestJS 方案相比，架构大幅简化：
> - 不再需要独立 Python Worker 进程
> - 不再需要 BullMQ + Redis 桥接 Node.js ↔ Python
> - FastAPI 直接 `from ultralytics import YOLO` 执行训练/评估/推理
> - 长任务（训练）用 arq 异步执行，轻量任务直接用 BackgroundTasks

---

## 四、核心数据库表设计（概要）

```
users                    teams                   projects
├─ id                    ├─ id                   ├─ id
├─ username              ├─ name                 ├─ name
├─ email                 ├─ owner_id (FK→users)  ├─ team_id (FK→teams, nullable)
├─ password_hash         ├─ created_at           ├─ created_by (FK→users)
├─ role (engineer/       └─ ...                  ├─ park (ganzhou/vietnam/...)
│   annotator/admin/                             ├─ task_type (detection/pose/
│   customer)                                    │   segment/embedding)
└─ ...                                           ├─ is_personal (bool)
                                                 └─ ...

team_members             datasets                annotations
├─ team_id (FK)          ├─ id                   ├─ id
├─ user_id (FK)          ├─ project_id (FK)      ├─ dataset_id (FK)
├─ role (owner/admin/    ├─ batch_name           ├─ image_id
│   member)              ├─ type (raw_videos/    ├─ label_id (FK→labels)
├─ permission (read/     │   extracted/dedup/    ├─ bbox_x, bbox_y,
│   write)               │   labeled/train/val)  │   bbox_w, bbox_h
└─ ...                   ├─ file_path            ├─ confidence (null=人工)
                         ├─ image_count          ├─ is_auto (bool)
                         ├─ parent_key           └─ ...
                         └─ ...

labels                   models                  training_jobs
├─ id                    ├─ id                   ├─ id
├─ project_id (FK)       ├─ project_id (FK)      ├─ model_id (FK)
├─ name                  ├─ filename             ├─ config (JSON)
├─ color                 ├─ version              ├─ status (queued/running/
└─ ...                   ├─ metrics (JSON)       │   paused/completed/stopped)
                         ├─ file_path            ├─ progress
                         ├─ is_in_use (bool)     ├─ metrics (JSON)
                         └─ ...                  ├─ started_at
                                                 └─ ...

deployments
├─ id
├─ model_id (FK)
├─ version
├─ zip_path
├─ deployed_by (FK→users)
└─ ...
```

---

## 五、关键设计决策

### 1. 园区 (park) 和任务类型 (task_type) 是两个不同层面的概念

#### 园区 (park)

- 园区只是**数据隔离标签**，不影响 UI
- `park='赣州' + task_type='detection'` → 全套页面正常使用，数据都有
- `park='越南' + task_type='detection'` → 同一套 UI、同一个侧边栏、同样的页面，**只是数据库里是空的**，等人往这个园区里上传数据就有了
- 园区就是一个过滤条件：`WHERE park = ?`

#### 任务类型 (task_type)

- 不同任务类型的**业务完全不同**，相当于不同的产品：

| 任务类型 | 标注形式 | 数据格式 | 评估指标 | Canvas 工具 |
|---|---|---|---|---|
| 目标检测 (detection) | BBox 画框 | YOLO .txt | mAP@50 | 矩形框 |
| 姿态估计 (pose) | 关键点连线 | COCO keypoints | OKS | 关键点 |
| 实例分割 (segment) | 多边形蒙版 | COCO segmentation | mAP@mask | 套索/笔刷 |
| 文本嵌入 (embedding) | 文本标签 | JSON/CSV | Cosine Similarity | 无 Canvas |

- `park='赣州' + task_type='pose'` → 目前没有姿态估计的平台，Header 上选了之后**侧边栏里全是空的**，相当于等着以后重建一个平台
- **目前只做目标检测**，`task_type` 字段先留着，其他三种以后再说

#### Header 下拉框的处理

- 两个下拉框**现在都做**，不复杂
- 园区下拉：选不同园区只是改过滤条件，切数据
- 任务类型下拉：目前只有「目标检测」可用，其他选项加 `disabled` + 「规划中」提示（和原型一样）
- 以后加了新任务类型，再取消 disabled

### 2. Canvas 标注工作台是一个统一组件，不拆分「手动标注」和「预标注审核」

- 三种模式只是**加载时数据不同**：
  - 手动标注 → Canvas + 空标注数据
  - 自动标注/预标注 → Canvas + 模型预置框（带置信度百分比）
  - 查看/审核 → Canvas + 已标注数据（可编辑）
- 画布缩放平移、工具栏、标签列表、标注列表、详情面板、翻页——**同一套代码**

### 3. 模型使用 (models_use) 和模型试用 (trial) 功能重叠

- 可以做在一起，或先只做 trial，models_use 后续合并

### 4. 训练实时监控的前后端通信

- 先做提交训练 + 轮询进度
- WebSocket 实时推送 Loss/mAP 曲线放第二期

---

## 六、开发顺序

### 约束链（必须按顺序）

```
0. 项目脚手架
    ↓  初始化 monorepo、数据库、前后端框架
1. 认证 + 布局框架
    ↓  登录/注册/JWT、Sidebar/Header/Breadcrumb/路由守卫
    ↓  ← header 上的园区和任务类型下拉框在这一步就做好
2. 算法管理
    ↓  个人算法 + 团队算法 CRUD、Pipeline 状态卡片
    ↓  必须选了一个算法才能进入后续页面
3. 数据中心
    ↓  文件上传、数据集管理列表、抽帧/去重/数据划分
    ↓  数据不进来，标注和训练都卡住
4. 数据标注
    ↓  Canvas 工作台（包括手工标注 + 预标注审核）
    ↓  标注完才能导出 train/val
5. 模型训练
    ↓  训练配置 + 提交到队列 + FastAPI 异步执行 YOLO 训练
    ↓  训练完才有模型文件
6. 模型评估
    ↓  评估完确认精度才能部署
7. 模型部署 + 试用
```

### 可随时插空做的模块（无硬依赖）

| 模块 | 建议时机 |
|---|---|
| 训练队列页面 | 和阶段 5 一起 |
| 团队管理 | 阶段 1 之后随时 |
| 个人中心 | 阶段 1 之后随时 |
| 模型总览 | 阶段 5 之后 |

### 可后移或砍范围的模块

| 模块 | 说明 |
|---|---|
| 模型使用 (models_use) | 与 trial 高度重叠，可合并 |
| 预标注审核 | 已在 Canvas 工作台中一次性实现 |
| 训练实时监控 (WebSocket) | 先用轮询，实时推送放第二期 |

### 时间估算

| 阶段 | 内容 | 纯开发 | 含调试 |
|---|---|---|---|
| 0 | 脚手架 | 1-2 天 | 2-3 天 |
| 1 | 认证+布局 | 2-3 天 | 3-5 天 |
| 2 | 算法管理 | 2-3 天 | 3-5 天 |
| 3 | 数据中心 | 5-7 天 | 7-10 天 |
| 4 | 数据标注（**最难**） | 5-7 天 | 7-12 天 |
| 5 | 模型训练 | 5-7 天 | 7-12 天 |
| 6 | 模型评估 | 2-3 天 | 3-5 天 |
| 7 | 部署+试用 | 2-3 天 | 3-5 天 |
| 8 | 团队+个人中心 | 3-4 天 | 4-6 天 |
| **总计** | | **约 5-8 周** | **约 8-13 周** |

> AI 可大幅加速 CRUD 代码编写，但 Canvas 标注和训练流程调试需要人工投入。

---

## 七、技术风险点

1. **Canvas 标注工作台** — 技术难度最高，需要 Fabric.js/Konva.js，涉及坐标转换、缩放平移、resize handles、翻页状态管理
2. **训练长任务管理** — 训练可能跑几小时，需要通过 arq + Redis 异步执行并上报进度；简单任务可直接用 FastAPI BackgroundTasks
3. **文件存储** — 图片/视频/模型文件体积大，开发阶段可用本地 FS，生产需要 MinIO/OSS
4. **RBAC 权限** — 原型已有雏形（owner/admin/member + read/write），重构时需认真设计

---

## 八、与现有原型的关系

- prototype/ 目录保留作为设计参考
- 现有数据都是 localStorage mock，无迁移负担，从零建表
- UI 风格对标 Ant Design，原型中的 CSS 变量（颜色、间距）可直接映射到 Ant Design 的 ConfigProvider token
