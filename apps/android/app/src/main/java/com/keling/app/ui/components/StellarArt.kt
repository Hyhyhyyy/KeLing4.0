package com.keling.app.ui.components

import android.graphics.BitmapFactory
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.BiasAlignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

// Shared atlases are decoded once across avatar/nav cells; keep a bounded 12 MiB cache.
private val LocalStellarReducedMotion = compositionLocalOf { false }

private object StellarBitmaps {
    private val cache = object : android.util.LruCache<String, android.graphics.Bitmap>(12 * 1024 * 1024) {
        override fun sizeOf(key: String, value: android.graphics.Bitmap) = value.allocationByteCount
    }
    @Synchronized fun load(context: android.content.Context, name: String, sample: Int): ImageBitmap? {
        val key = "$name:$sample"
        val bitmap = cache.get(key) ?: runCatching {
            context.assets.open("stellar/$name.png").use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) }
        }.getOrNull()?.also { cache.put(key, it) }
        return bitmap?.asImageBitmap()
    }
}

@Composable fun StellarSprite(atlas: String, index: Int, description: String, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val bitmap by produceState<ImageBitmap?>(null, atlas) {
        value = withContext(Dispatchers.IO) { StellarBitmaps.load(context.applicationContext, atlas, 2) }
    }
    Canvas(modifier.semantics { contentDescription = description }) {
        bitmap?.let { image ->
            val tile = IntSize(image.width / 3, image.height / 3); val cell = index.coerceIn(0, 8)
            drawImage(image, srcOffset = IntOffset((cell % 3) * tile.width, (cell / 3) * tile.height), srcSize = tile,
                dstSize = IntSize(size.width.toInt(), size.height.toInt()), filterQuality = androidx.compose.ui.graphics.FilterQuality.None)
        }
    }
}

/** Canonical shared PNGs are packaged as assets. Decode a sampled bitmap for phone memory. */
@Composable fun StellarArt(name: String, description: String?, modifier: Modifier = Modifier, contentScale: ContentScale = ContentScale.Fit, alignment: Alignment = Alignment.Center) {
    val context = LocalContext.current
    val bitmap by produceState<ImageBitmap?>(null, name) {
        value = withContext(Dispatchers.IO) {
            StellarBitmaps.load(context.applicationContext, name, if (name.startsWith("scene_") || name == "station_full") 2 else 4)
        }
    }
    // Reserve the supplied size while decoding. A one-off fade respects the system animation scale.
    val reveal by animateFloatAsState(if (bitmap == null) 0f else 1f, tween(if (LocalStellarReducedMotion.current) 0 else 220), label = "stellar-art-reveal")
    Box(modifier) { bitmap?.let { Image(it, contentDescription = description, modifier = Modifier.matchParentSize().graphicsLayer { alpha = reveal }, contentScale = contentScale, alignment = alignment, filterQuality = androidx.compose.ui.graphics.FilterQuality.None) } }
}
/** Phone scenes use a short crop; controls remain on an opaque surface below. */
@Composable fun StellarSceneCard(name: String, title: String, description: String, modifier: Modifier = Modifier) {
    Card(modifier.fillMaxWidth()) { Column {
        StellarArt(name, null, Modifier.fillMaxWidth().height(144.dp), ContentScale.Crop,
            if (name == "station_full") Alignment.CenterEnd else BiasAlignment(0f, 0.4f))
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(title, modifier = Modifier.semantics { heading() }, style = MaterialTheme.typography.titleMedium)
            Text(description, style = MaterialTheme.typography.bodySmall)
        }
    } }
}
@Composable fun StellarActionButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    Box(modifier.heightIn(min = 52.dp).widthIn(min = 108.dp), contentAlignment = androidx.compose.ui.Alignment.Center) {
        StellarArt("button_primary", null, Modifier.matchParentSize(), ContentScale.FillBounds)
        TextButton(onClick = onClick, enabled = enabled, modifier = Modifier.fillMaxWidth(), contentPadding = PaddingValues(horizontal = 24.dp, vertical = 12.dp)) { Text(text) }
    }
}
@Composable fun StellarTheme(reducedMotion: Boolean = false, content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalStellarReducedMotion provides reducedMotion) { MaterialTheme(colorScheme = lightColorScheme(primary = Color(0xFF285950), onPrimary = Color(0xFFFFF6DF),
        secondary = Color(0xFF976449), background = Color(0xFFF5F6EE), surface = Color(0xFFFFFCF4),
        onSurface = Color(0xFF14263D), onBackground = Color(0xFF14263D)), content = content) }
}
@Composable fun StellarSelect(label: String, value: String, options: List<Pair<String, String>>, enabled: Boolean = true, onSelect: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth()) {
        Text(label, style = MaterialTheme.typography.labelMedium)
        Box {
            OutlinedButton(onClick = { expanded = true }, enabled = enabled, modifier = Modifier.fillMaxWidth()) {
                Text(options.firstOrNull { it.first == value }?.second ?: "请选择")
            }
            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }, modifier = Modifier.heightIn(max = 320.dp)) {
                options.forEach { (id, name) -> DropdownMenuItem(text = { Text(name) }, onClick = { expanded = false; onSelect(id) }) }
            }
        }
    }
}
