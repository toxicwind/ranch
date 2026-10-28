import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * MicCapture — raw PCM capture from the built-in microphone.
 *
 * Runs under `app_process` as the adb shell user, which holds RECORD_AUDIO
 * on stock Android (granted by default for com.android.shell). No APK install,
 * no root, no app lifecycle to babysit: dex the class, push it, run it.
 *
 *   CLASSPATH=/data/local/tmp/MicCapture.dex app_process /data/local/tmp \
 *       MicCapture <rate> <seconds> <outfile>
 *
 * Writes raw signed 16-bit little-endian mono PCM to <outfile>; progress
 * diagnostics go to stderr so stdout stays clean for piping.
 *
 * AudioSource.VOICE_RECOGNITION is used deliberately: it is the least
 * aggressively processed input path on Pixel, so AGC and noise suppression do
 * not reshape the spectrum being measured.
 */
public class MicCapture {
    public static void main(String[] args) {
        try {
            int rate = 48000;
            int durSec = 5;
            String out = "/data/local/tmp/mic.pcm";
            if (args.length > 0) rate = Integer.parseInt(args[0]);
            if (args.length > 1) durSec = Integer.parseInt(args[1]);
            if (args.length > 2) out = args[2];

            int ch = AudioFormat.CHANNEL_IN_MONO;
            int enc = AudioFormat.ENCODING_PCM_16BIT;
            int minBuf = AudioRecord.getMinBufferSize(rate, ch, enc);
            if (minBuf <= 0) {
                System.err.println("ERR minBufferSize=" + minBuf);
                System.exit(2);
            }
            int bufSize = minBuf * 4;
            AudioRecord rec = new AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION, rate, ch, enc, bufSize);
            if (rec.getState() != AudioRecord.STATE_INITIALIZED) {
                System.err.println("ERR state=" + rec.getState());
                System.exit(3);
            }
            System.err.println("OK rate=" + rate + " minbuf=" + minBuf + " buf=" + bufSize);

            rec.startRecording();
            if (rec.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING) {
                System.err.println("ERR recordingState=" + rec.getRecordingState());
                System.exit(4);
            }
            System.err.println("OK recording");

            byte[] buf = new byte[4096];
            long deadline = System.currentTimeMillis() + durSec * 1000L;
            long total = 0;
            OutputStream os = new FileOutputStream(out);
            while (System.currentTimeMillis() < deadline) {
                int n = rec.read(buf, 0, buf.length);
                if (n > 0) {
                    os.write(buf, 0, n);
                    total += n;
                } else if (n < 0) {
                    System.err.println("ERR read=" + n);
                    break;
                }
            }
            rec.stop();
            rec.release();
            os.close();
            System.err.println("OK bytes=" + total);
        } catch (Throwable t) {
            System.err.println("ERR " + t.getClass().getName() + ": " + t.getMessage());
            t.printStackTrace();
            System.exit(1);
        }
    }
}
