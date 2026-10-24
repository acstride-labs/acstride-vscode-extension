import java.io.BufferedInputStream

private class FastScanner {
    private val input = BufferedInputStream(System.`in`)
    fun nextLong(): Long {
        var c = input.read()
        while (c <= 32 && c >= 0) c = input.read()
        var sign = 1
        if (c == 45) { sign = -1; c = input.read() }
        var value = 0L
        while (c > 32) { value = value * 10 + c - 48; c = input.read() }
        return value * sign
    }
}

fun main() {
    val input = FastScanner()
    val a = input.nextLong()
    val b = input.nextLong()
    println(a + b)
}
