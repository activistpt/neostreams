package com.gateway.neostreams;

import android.media.MediaPlayer;
import android.util.Log;
import android.view.Surface;

import java.io.IOException;

public class StreamPlayer implements MediaPlayer.OnPreparedListener, MediaPlayer.OnCompletionListener, MediaPlayer.OnErrorListener {

    private static final String TAG = "NeoStreams";

    private MediaPlayer mediaPlayer;
    private Surface surface;
    private boolean isPlaying;

    public StreamPlayer(android.content.Context context, Surface surface) {
        this.surface = surface;
        this.mediaPlayer = new MediaPlayer();
        this.mediaPlayer.setOnPreparedListener(this);
        this.mediaPlayer.setOnCompletionListener(this);
        this.mediaPlayer.setOnErrorListener(this);
    }

    public void setDataSource(String url) throws IOException {
        mediaPlayer.reset();
        mediaPlayer.setDataSource(url);
        mediaPlayer.setSurface(surface);
        mediaPlayer.prepareAsync();
    }

    public void start() {
        if (mediaPlayer != null && !isPlaying) {
            mediaPlayer.start();
            isPlaying = true;
        }
    }

    public void stop() {
        if (mediaPlayer != null && isPlaying) {
            mediaPlayer.stop();
            mediaPlayer.reset();
            isPlaying = false;
        }
    }

    @Override
    public void onPrepared(MediaPlayer mp) {
        mp.start();
        isPlaying = true;
        Log.d(TAG, "MediaPlayer preparado e iniciado");
    }

    @Override
    public void onCompletion(MediaPlayer mp) {
        isPlaying = false;
        mp.seekTo(0);
        mp.start();
        isPlaying = true;
        Log.d(TAG, "Stream completo, reiniciando");
    }

    @Override
    public boolean onError(MediaPlayer mp, int what, int extra) {
        Log.e(TAG, "Erro do MediaPlayer: " + what + ", " + extra);
        isPlaying = false;
        mp.reset();
        return false;
    }

    public void release() {
        if (mediaPlayer != null) {
            mediaPlayer.release();
            mediaPlayer = null;
        }
    }

    public void pause() {
        if (mediaPlayer != null && isPlaying) {
            mediaPlayer.pause();
            isPlaying = false;
        }
    }

    public void seekTo(int position) {
        if (mediaPlayer != null && isPlaying) {
            mediaPlayer.seekTo(position);
        }
    }

    public int getCurrentPosition() {
        return mediaPlayer != null ? mediaPlayer.getCurrentPosition() : 0;
    }

    public int getDuration() {
        return mediaPlayer != null ? mediaPlayer.getDuration() : 0;
    }

    public boolean isPlaying() {
        return isPlaying;
    }
}
