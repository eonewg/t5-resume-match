# T5 Resume Match UI Refresh
Project: 4839069813519735528

> 2026-09-09：下列早期 Stitch 规范保留作设计来源；当前 UI Polish 的尺寸、状态和实际浏览器取舍以 [Polish 交付说明](polish.md) 为准。当前实现使用统一深青绿、紧凑表单和技能 chip，不再采用早期“技能仅纯文本列表”的建议。

## 1. Visual Theme & Atmosphere
A restrained, trustworthy career preparation product for Chinese students and graduates. Quiet document-like surfaces, generous whitespace, practical next actions. No giant hero, glass effects, gradients, emoji icons, nested cards or excessive badges.

## 2. Color Palette & Roles
Background warm neutral #F7F8F6; surface #FFFFFF; text #202A27; secondary text #59645F; border #DDE3DF. Single accent deep teal #176B58, hover #105443, soft selected background #EAF3EF. Error #A33131 and warning #795B20 are semantic only. Never encode state by color alone.

## 3. Typography Rules
Noto Sans / system sans-serif with Microsoft YaHei and PingFang SC fallbacks. Body 16px/1.65; labels 14px/1.5; supporting text minimum 13px; h1 28px/1.3 weight 600; h2 20px/1.4; h3 16px/1.5. Score 56px on desktop, 44px on mobile. No decorative all-caps English headings.

## 4. Component Stylings
Spacing 4/8/12/16/24/32/48px. Radius 10px for forms/panels, 8px buttons. Borders 1px #DDE3DF; shadows none except overlay 0 8px 28px #202A2714. Max content width 1120px; readable text 720px.
Desktop sidebar 216px; content padding 40px. Navigation: 我的简历 / 目标岗位 / 匹配分析 / 简历优化 / 市场洞察. Active item clear background and text emphasis. No fake account/avatar or notifications.
Buttons primary solid teal, secondary white border, minimum 44px touch height. One primary action per section. Forms explicit persistent labels, visible focus 2px teal, 16px input text. Tables/lists use separators, not cards within cards. Skills are plain lists, not a pill cloud.
Empty states explain next step with one action. Loading uses concise live status with disabled repeated action; errors retain input and provide retry. Demonstration results say 演示数据, never imply real model output. Missing salary is 暂未提供, never zero.

## 5. Layout Principles
Resume: saved versions, original import, editable confirmed information and optional new parsing suggestions, explicit fact confirmation before save. Preserve every field and history.
Jobs: saved role selection, requirements, tools, salary, source if actually available, input new role, choose resume and analyze.
Matching: current pair, comprehensive score, directly matched abilities, missing abilities, next step to optimize, collapsed exact calculation evidence. No invented recommendations or reassignment of skill facts.
Diagnosis: overall advice, targeted advice, original/suggested experience comparison when structured text permits. Suggestions require manual verification; no invented automatic apply API.
Market: actual skill and salary distributions, sample count, provenance/date and missing values. No fabricated trends or numbers.

## 6. Mobile Behavior
At 390px use top page title and fixed bottom five-item text navigation, content padding 16px plus bottom safe area. Forms stack. Resume import collapsible, editor full-width. Diagnosis comparisons stack original before suggestion. Charts horizontal bars/scrollable tables with labels. Full-width main action, no horizontal page overflow. Respect reduced motion.
