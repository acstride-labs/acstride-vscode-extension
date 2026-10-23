import sys


# ${PROBLEM_ID}: read two integers and print their sum.
def solve():
    values = list(map(int, sys.stdin.buffer.read().split()))
    if len(values) >= 2:
        print(values[0] + values[1])


if __name__ == "__main__":
    solve()
