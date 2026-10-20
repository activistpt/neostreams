package com.gateway.neostreams;

import android.content.Context;
import android.graphics.Typeface;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.ImageView;
import android.widget.TextView;

import java.util.List;

public class PlaylistAdapter extends ArrayAdapter<NeoStreamsActivity.PlaylistSource> {

    private Context context;
    private int resource;

    public PlaylistAdapter(Context context, int resource) {
        super(context, resource);
        this.context = context;
        this.resource = resource;
    }

    public PlaylistAdapter(Context context, int resource, List<NeoStreamsActivity.PlaylistSource> sources) {
        super(context, resource, sources);
        this.context = context;
        this.resource = resource;
    }

    @Override
    public View getView(int position, View convertView, ViewGroup parent) {
        if (convertView == null) {
            convertView = LayoutInflater.from(context).inflate(resource, parent, false);
        }

        NeoStreamsActivity.PlaylistSource source = getItem(position);
        if (source == null) return convertView;

        TextView nameText = convertView.findViewById(R.id.nameText);
        TextView typeText = convertView.findViewById(R.id.typeText);
        ImageView typeIcon = convertView.findViewById(R.id.typeIcon);

        if (nameText != null) {
            nameText.setText(source.name);
            nameText.setTextColor(context.getResources().getColor(R.color.cp_text_primary));
            nameText.setTypeface(null, Typeface.BOLD);
            nameText.setLetterSpacing(0.05f);
        }

        if (typeText != null) {
            String typeInfo = source.type;
            if (typeInfo == null || typeInfo.isEmpty()) {
                typeInfo = source.xtream.base != null && !source.xtream.base.isEmpty() ?
                        "Xtream API" : "Stream M3U";
            }
            typeText.setText(typeInfo.toUpperCase());
            typeText.setTextColor(context.getResources().getColor(R.color.cp_primary));
            typeText.setLetterSpacing(0.1f);
        }

        if (typeIcon != null) {
            if ("xtream-m3u".equals(source.type)) {
                typeIcon.setImageResource(R.drawable.ic_xtream);
                typeIcon.setColorFilter(context.getResources().getColor(R.color.cp_primary));
                typeIcon.setContentDescription("Xtream API");
            } else {
                typeIcon.setImageResource(R.drawable.ic_stream);
                typeIcon.setColorFilter(context.getResources().getColor(R.color.cp_secondary));
                typeIcon.setContentDescription("M3U Stream");
            }
        }

        return convertView;
    }
}
