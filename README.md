# Git Analytics Dashboard

開発生産性を可視化するダッシュボードアプリケーション。Gitリポジトリのコミット履歴、コード変更量、貢献者の統計などを分析し、直感的なグラフで表示します。

## 機能

- コミット頻度の時系列分析
- コード変更量（追加/削除）の統計
- 貢献者（コミッター）の活動分析
- ファイル種類別のコード行数（SLOC）分析
- ブランチ情報の表示
- URLパラメータによるリポジトリ指定機能

## 技術スタック

- フロントエンド
  - HTML/CSS/JavaScript
  - Chart.js（データの可視化）
- バックエンド
  - Node.js
  - Express
  - simple-git（Gitリポジトリの操作）

## インストール

```bash
# リポジトリのクローン
git clone https://github.com/tamu960925/Git-Analytics-Dashboard.git
cd Git-Analytics-Dashboard

# 依存関係のインストール
npm install
```

## 使用方法

1. サーバーの起動:
```bash
npm start
```

2. ブラウザでアクセス:
```
http://localhost:3000
```

3. 分析方法:
- フォームにGitリポジトリのURLを入力
- または、URLパラメータで直接指定:
```
http://localhost:3000?repo=https://github.com/username/repository
```

## 対応リポジトリ

- GitHub
- GitLab
- Bitbucket

## 分析指標

### コミット分析
- 総コミット数
- アクティブ日数
- 時間帯別コミット頻度
- コミット頻度の推移

### コード変更分析
- 総追加行数
- 総削除行数
- ファイル種類別のコード量

### 貢献者分析
- トップコントリビューター
- 貢献者ごとのコミット数
- 貢献者ごとの変更量

### ブランチ分析
- アクティブなブランチ数
- 最もアクティブなブランチ

## ライセンス

MIT

## 作者

Yousuke Tamura
