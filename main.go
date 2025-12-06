package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sync"
)

// 默认初始存档
const defaultSaveData = `{"gold": 1000, "inventory": [], "deck": null}`
const savePath = "./data/save.json"

var fileLock sync.Mutex // 防止并发写入文件出错

func main() {
	// 1. 静态资源服务
	// static 目录存放网页代码
	http.Handle("/", http.FileServer(http.Dir("./static")))
	// assets 目录存放图片
	http.Handle("/assets/", http.StripPrefix("/assets/", http.FileServer(http.Dir("./assets"))))

	// 2. API 路由
	http.HandleFunc("/api/load", handleLoad)
	http.HandleFunc("/api/save", handleSave)

	fmt.Println("游戏服务已启动: http://localhost:8080")
	// 自动打开浏览器 (可选，视操作系统而定，这里仅打印地址)
	http.ListenAndServe(":8080", nil)
}

// 处理读取存档
func handleLoad(w http.ResponseWriter, r *http.Request) {
	fileLock.Lock()
	defer fileLock.Unlock()

	// 尝试读取文件
	data, err := os.ReadFile(savePath)
	if os.IsNotExist(err) {
		// 如果文件不存在，创建并写入默认存档
		os.MkdirAll(filepath.Dir(savePath), 0755)
		os.WriteFile(savePath, []byte(defaultSaveData), 0644)
		data = []byte(defaultSaveData)
	} else if err != nil {
		http.Error(w, "无法读取存档", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

// 处理保存存档
func handleSave(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "仅支持 POST", http.StatusMethodNotAllowed)
		return
	}

	// 读取请求体
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "无效的数据", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	// 简单的 JSON 校验，确保前端传过来的是合法 JSON
	if !json.Valid(body) {
		http.Error(w, "无效的 JSON 格式", http.StatusBadRequest)
		return
	}

	fileLock.Lock()
	defer fileLock.Unlock()

	// 写入文件
	err = os.WriteFile(savePath, body, 0644)
	if err != nil {
		http.Error(w, "保存失败", http.StatusInternalServerError)
		return
	}

	w.Write([]byte(`{"status": "ok"}`))
}
