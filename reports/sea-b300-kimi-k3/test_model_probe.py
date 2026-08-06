"""统计 model/test_model.py 里实际有多少项自检。

单独成文件是为了让 verify.py 能在不执行自检（耗时）的情况下拿到项数，
从而核对报告正文声称的数字是否属实。用 AST 静态计数而非跑一遍，
避免把"报告说有 N 项"变成一句无法验证的话。
"""

from __future__ import annotations

import ast
from pathlib import Path

TEST_FILE = Path(__file__).resolve().parent / "model" / "test_model.py"


def count_checks() -> int:
    """静态统计 check(...) 的调用次数，循环内的按循环次数展开。"""
    tree = ast.parse(TEST_FILE.read_text(encoding="utf-8"))
    total = 0

    class Counter(ast.NodeVisitor):
        def __init__(self) -> None:
            self.loop_multiplier = [1]

        def visit_For(self, node: ast.For) -> None:
            n = 1
            if isinstance(node.iter, (ast.List, ast.Tuple)):
                n = len(node.iter.elts)
            elif (isinstance(node.iter, ast.Call)
                  and isinstance(node.iter.func, ast.Attribute)
                  and node.iter.func.attr == "get"):
                # P.get("capacity.decode_points") 有 3 个标定点
                n = 3
            self.loop_multiplier.append(self.loop_multiplier[-1] * n)
            for child in node.body:
                self.visit(child)
            self.loop_multiplier.pop()

        def visit_Call(self, node: ast.Call) -> None:
            nonlocal total
            if isinstance(node.func, ast.Name) and node.func.id == "check":
                total += self.loop_multiplier[-1]
            self.generic_visit(node)

    Counter().visit(tree)
    return total


if __name__ == "__main__":
    print(count_checks())
