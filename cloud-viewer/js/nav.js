// nav.js
// 负责顶部 tab 切换（Hive / Aliyun）

const tabs = document.querySelectorAll(".tab");
const views = document.querySelectorAll(".view");

function switchTab(tabName) {

  // 切换按钮高亮
  tabs.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });

  // 切换页面显示
  views.forEach(view => {
    view.classList.toggle("hidden", view.id !== "view-" + tabName);
  });

  // 通知页面逻辑（例如图表 resize）
  window.dispatchEvent(new CustomEvent("viewer:tabchange", {
    detail: { tab: tabName }
  }));
}

// 绑定点击事件
tabs.forEach(btn => {
  btn.addEventListener("click", () => {
    switchTab(btn.dataset.tab);
  });
});

// 页面初始化时触发一次
const defaultTab = document.querySelector(".tab.active")?.dataset.tab || "hive";
switchTab(defaultTab);