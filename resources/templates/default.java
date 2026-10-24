import java.io.*;

public class Main {
    private static final class FastScanner {
        private final InputStream input = new BufferedInputStream(System.in);
        long nextLong() throws IOException {
            int c;
            do { c = input.read(); } while (c <= 32 && c >= 0);
            if (c < 0) throw new EOFException();
            int sign = 1;
            if (c == '-') { sign = -1; c = input.read(); }
            long value = 0;
            while (c > 32) { value = value * 10 + c - '0'; c = input.read(); }
            return value * sign;
        }
    }

    public static void main(String[] args) throws Exception {
        FastScanner input = new FastScanner();
        long a = input.nextLong();
        long b = input.nextLong();
        System.out.println(a + b);
    }
}
