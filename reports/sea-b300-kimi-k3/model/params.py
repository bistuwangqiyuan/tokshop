"""参数基座加载器。

设计意图
--------
所有外生数字只有一个来源：params.yaml。代码里不允许出现裸字面量常数（除了
纯数学常数与单位换算）。这样第三方替换任一参数即可全局重算，也便于自检检查
「报告里的数字是否真的来自参数与公式，而不是手写」。

params.yaml 中的叶子节点有两种写法：
    a) 带元数据的字典：{value: 6.7917, src: S-20, date: ...}
    b) 裸值：6.7917
`get()` 两种都能读，统一返回值本身；`meta()` 返回元数据字典。
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

PARAMS_PATH = Path(__file__).with_name("params.yaml")


@lru_cache(maxsize=1)
def _raw() -> dict:
    with open(PARAMS_PATH, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def _walk(path: str) -> Any:
    node: Any = _raw()
    for part in path.split("."):
        if not isinstance(node, dict) or part not in node:
            raise KeyError(f"params.yaml 中不存在路径 {path!r}（在 {part!r} 处中断）")
        node = node[part]
    return node


def get(path: str) -> Any:
    """读取参数值。若叶子是带 value 键的元数据字典，则解包出 value。"""
    node = _walk(path)
    if isinstance(node, dict) and "value" in node:
        return node["value"]
    return node


def meta(path: str) -> dict:
    """读取参数的元数据（src / date / note 等）。裸值参数返回空字典。"""
    node = _walk(path)
    return node if isinstance(node, dict) else {}


def src(path: str) -> str:
    """读取参数的信源编号，供报告与自检交叉核对。"""
    return str(meta(path).get("src", ""))


def raw() -> dict:
    """返回整棵参数树的只读视图，供需要遍历的模块使用（如国家清单）。"""
    return _raw()


# --- 常用派生量：集中在此，避免各模块各算一遍而口径漂移 -------------------

def usd_cny() -> float:
    return float(get("fx.usd_cny"))


def rent_usd_per_month(rent_cny: float | None = None) -> float:
    """月租金的美元值。收入以美元计价，成本以人民币计价，全模型统一折成美元记账。"""
    cny = float(get("rent.given_cny_per_month")) if rent_cny is None else float(rent_cny)
    return cny / usd_cny()


def rent_usd_per_gpu_hour(rent_cny: float | None = None) -> float:
    gpus = float(get("rent.gpus_per_node"))
    hours = float(get("meta.hours_per_month"))
    return rent_usd_per_month(rent_cny) / (gpus * hours)


def usable_hbm_tb_per_node() -> float:
    """八卡可用显存合计（TB，十进制）。用实测可见值而非 288GB 标称。"""
    gib = float(get("hardware.usable_hbm_gib_per_gpu"))
    gpus = float(get("rent.gpus_per_node"))
    return gib * gpus * (1024 ** 3) / 1e12


def aggregate_bandwidth_tb_s() -> float:
    return float(get("hardware.hbm_bandwidth_tb_s")) * float(get("rent.gpus_per_node"))


def node_peak_pflops() -> float:
    return float(get("hardware.nvfp4_dense_pflops")) * float(get("rent.gpus_per_node"))
