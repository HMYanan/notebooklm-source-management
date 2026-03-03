# 终端开发核心指令全景指南 (Mac/Linux Terminal Cheat Sheet)

作为一名前端或扩展开发者，熟练掌握终端命令行（CLI）是进阶高级工程师的必经之路。图形界面（GUI）虽然直观，但在自动化脚本、服务器部署、Git 高阶操作中，终端指令具备**绝对的统治力与极速的确定性**。

本指南将 Mac/Linux 终端中最常用的核心指令进行架构化分类，重点阐述其在真实开发场景中的**底层逻辑与用途**。

---

## 一、 时空穿梭与感知（目录定位导航）

在终端的世界里，没有鼠标点击文件夹的概念，一切移动依靠路径指定。

### 1. `pwd` (Print Working Directory)
- **用途**：显示当前你究竟在哪个目录下（你在哪）。
- **用法**：
  ```bash
  pwd
  # 输出示例：/Users/hmy/Desktop/notebooklm-source-plus-main
  ```

### 2. `ls` (List)
- **用途**：展示当前目录里的所有文件和文件夹（你周围有什么）。
- **用法**：
  ```bash
  ls          # 仅显出文件名
  ls -l       # 详细列表模式（包含权限、拥有者、体积、修改时间）
  ls -a       # 显示隐藏文件（比如很关键的 .git 文件夹和 .gitignore）
  ls -la      # (高频) 结合上述两者，巨细无遗地展示所有内容
  ```

### 3. `cd` (Change Directory)
- **用途**：穿越到指定的文件夹（你要去哪）。
- **用法**：
  ```bash
  cd src           # 进入当前目录下的 src 文件夹
  cd ..            # 返回上一级目录（非常常用，两个点代表父目录）
  cd ~             # 瞬间回到当前用户的根目录（家目录 /Users/hmy）
  cd /             # 前往操作系统的最底层系统根目录
  cd -             # 回到你刚才所在的那个目录（目录历史切换）
  ```

---

## 二、 资产创造与毁灭（文件操作）

### 1. `mkdir` (Make Directory)
- **用途**：创建一个新的空文件夹。
- **用法**：
  ```bash
  mkdir components       # 创建一个叫做 components 的文件夹
  mkdir -p src/js/utils  # 递归创建目录树（如果父集 src 和 js 不存在，会自动一并创建，不会报错）
  ```

### 2. `touch`
- **用途**：快速创建一个空文件，或更新已有文件的时间戳。
- **用法**：
  ```bash
  touch style.css        # 创建一个空 css 文件
  ```

### 3. `cp` (Copy)
- **用途**：复制文件或文件夹。
- **用法**：
  ```bash
  cp index.html backup.html   # 将 index.html 复制一份名为 backup.html
  cp -r src/ dist/            # (重要) 复制整个文件夹及其中的所有内容，必须加上 -r (recursive 递归) 参数
  ```

### 4. `mv` (Move)
- **用途**：移动文件，或者对文件进行**重命名**。
- **用法**：
  ```bash
  mv old.js new.js            # 重命名操作
  mv script.js ./src/         # 把 script.js 移动到当前目录下的 src 文件夹里
  ```

### 5. `rm` (Remove) - ⚠️ 极度危险
- **用途**：永久删除文件或文件夹（终端删除**不进回收站**，无法轻易找回！）。
- **用法**：
  ```bash
  rm file.txt                 # 删除单独的 file.txt
  rm -r node_modules/         # 删除整个 node_modules 文件夹及内部所有文件 (-r 递归)
  rm -rf node_modules/        # (-f 强迫强制删除，不提示警告) 前端天天用来清空缓存依赖包的高频死神指令
  ```

---

## 三、 本质透视（内容查看与过滤）

### 1. `cat` (Concatenate)
- **用途**：直接在终端屏幕上一次性输出文件的全部内容。适合查看短小的代码文件。
- **用法**：
  ```bash
  cat .gitignore      # 直接在终端里把忽略的内容印出来
  ```

### 2. `less` 或 `more`
- **用途**：分页查看文件。如果一个日志文件犹如长篇巨制用 `cat` 会刷黑满屏，用 `less` 可以用上下方向键从容阅读。
- **用法**：
  ```bash
  less error.log      # 进入阅读模式，按 'q' 键退出
  ```

### 3. `tail` 与 `head`
- **用途**：查看文件的末尾/开头部分。在服务端排查报错时，通常只看最新的一段日志。
- **用法**：
  ```bash
  tail -n 10 server.log   # 仅查看文件最后紧要的 10 行
  tail -f server.log      # (神器) 持续追踪文件末尾！一旦日志右新写入，屏幕会直接滚动刷新。按 Ctrl+C 退出。
  ```

### 4. `grep` (Global Regular Expression Print)
- **用途**：在茫茫文件海中，通过关键字甚至正则搜索里面的特定内容（搜索漏网之鱼）。
- **用法**：
  ```bash
  grep "TODO" content.js          # 在 content.js 中找出所有包含 TODO 注释的行
  grep -r "console.log" src/      # 在整个 src 目录下，地毯式排查找出还没删干净的 console.log
  ```

---

## 四、 特权与防爆（权限控制）

在 Mac (基于 Unix) 中，一个文件能不能被读取(r)、写入(w)、或者作为程序执行(x)，都由权限机制死死锁住。权限分为：你(User)、你的团队(Group)、其他人(Others)。

### 1. `sudo` (Superuser Do)
- **用途**：戴上“无限权力手套”。在任何没有权限执行的命令前面加上 `sudo`，你将化身操作系统的核心神明 `root`。
- **用法**：
  ```bash
  sudo rm -rf /System/*   # (绝对不要试！) 强行摧毁系统核心
  sudo npm install -g yarn # 以全局上帝权限安装环境包（当前遇到无写权限时使用，系统会让你盲敲密码验证）
  ```

### 2. `chmod` (Change Mode)
- **用途**：修改文件或文件夹的权限。
- **用法**：
  ```bash
  chmod +x build.sh       # 赋予 build.sh 作为程序运行的权力 (+x = executable)
  chmod 777 public/       # 极端奔放地赋予所有用户对该目录彻底的读、写、执行权限
  ```

---

## 五、 时空定格（网络与进程）

当服务器卡死或者端口被不认识的程序占用时，我们需要外科手术式的干预。

### 1. `curl`
- **用途**：神级的命令行网络请求工具，能不打开浏览器直接发 GET/POST。
- **用法**：
  ```bash
  curl https://api.github.com/users/octocat  # 瞬间拉取一份 JSON 的 API 响应结果
  ```

### 2. `top` / `htop`
- **用途**：字符画面的系统“活动监视器”。即时显示是哪个野兽进程把你的 CPU 和内存榨干了。
- **用法**：
  ```bash
  top   # 展现系统的内存与CPU占用进程（按 q 退出）
  ```

### 3. `ps` (Process Status) & `kill`
- **用途**：查找和暗杀僵尸进程。如果热更新服务器卡死，可以查出端口号把它“处决”。
- **用法**：
  ```bash
  ps -ef | grep node      # 利用管道符 `|`，找出当前所有名为 node 的运行中进程及 PID (身份码)
  kill -9 1024            # 强制处决 (-9) PID 为 1024 的僵尸进程
  ```

---

💡 **结语**：终端是与计算机底层直接握手的工具。作为架构师，理解命令行的哲学能让你脱离 IDE 图形界面的糖衣，精准把控工程的每一次脉动。
