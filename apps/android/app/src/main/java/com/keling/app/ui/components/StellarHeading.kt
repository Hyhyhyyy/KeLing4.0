package com.keling.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp

/** Shared artwork is decorative; only the text is exposed as a heading. */
@Composable
fun StellarHeading(
    text: String,
    mascot: Int,
    modifier: Modifier = Modifier,
    style: TextStyle = MaterialTheme.typography.headlineSmall,
    color: Color = Color.Unspecified,
    fontWeight: FontWeight? = null,
    fontSize: TextUnit = TextUnit.Unspecified,
    compact: Boolean = false
) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        StellarSprite("title_mascots", mascot, null, Modifier.size(if (compact) 44.dp else 52.dp))
        Text(text, modifier = Modifier.weight(1f, fill = false).semantics { heading() },
            style = style, color = color, fontWeight = fontWeight, fontSize = fontSize)
    }
}

/** Small, original line drawings for section titles: star, orbit, book, compass. */
@Composable
fun StellarTitleMark(modifier: Modifier = Modifier, motif: Int = 0, color: Color = MaterialTheme.colorScheme.primary) {
    val accent = Color(0xFFD6A347)
    Canvas(modifier.size(20.dp).clearAndSetSemantics {}) {
        scale(size.width / 24f, size.height / 24f, pivot = Offset.Zero) {
            val stroke = Stroke(width = 1.65f, cap = StrokeCap.Round)
            when (motif.mod(4)) {
                1 -> {
                    drawCircle(color, 5.5f, Offset(12f, 12f), style = stroke)
                    drawOval(color, Offset(2f, 8.5f), Size(20f, 7f), style = stroke)
                    drawCircle(accent, 1.6f, Offset(19.5f, 5f))
                }
                2 -> {
                    val book = Path().apply {
                        moveTo(3f, 5f); lineTo(8f, 5f); lineTo(12f, 7f); lineTo(16f, 5f); lineTo(21f, 5f)
                        lineTo(21f, 18f); lineTo(16f, 18f); lineTo(12f, 20f); lineTo(8f, 18f); lineTo(3f, 18f); close()
                    }
                    drawPath(book, color, style = stroke)
                    drawLine(color, Offset(12f, 7f), Offset(12f, 20f), strokeWidth = 1.65f)
                    drawLine(accent, Offset(6f, 9f), Offset(9f, 10f), strokeWidth = 1.65f, cap = StrokeCap.Round)
                }
                3 -> {
                    drawCircle(color, 8f, Offset(12f, 12f), style = stroke)
                    val needle = Path().apply { moveTo(16f, 7f); lineTo(14f, 14f); lineTo(7f, 17f); lineTo(10f, 10f); close() }
                    drawPath(needle, accent, style = stroke)
                }
                else -> {
                    val star = Path().apply {
                        moveTo(11f, 2f); lineTo(13.6f, 8.4f); lineTo(20f, 11f); lineTo(13.6f, 13.6f)
                        lineTo(11f, 20f); lineTo(8.4f, 13.6f); lineTo(2f, 11f); lineTo(8.4f, 8.4f); close()
                    }
                    drawPath(star, color, style = stroke)
                    drawCircle(accent, 1.5f, Offset(20f, 20f))
                }
            }
        }
    }
}

@Composable
fun StellarSectionTitle(
    text: String,
    modifier: Modifier = Modifier,
    motif: Int = 0,
    style: TextStyle = MaterialTheme.typography.titleMedium,
    color: Color = Color.Unspecified,
    fontWeight: FontWeight? = null,
    fontSize: TextUnit = TextUnit.Unspecified
) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
        StellarTitleMark(motif = motif)
        Text(text, Modifier.weight(1f, fill = false).semantics { heading() }, style = style,
            color = color, fontWeight = fontWeight, fontSize = fontSize)
    }
}

@Composable
fun StellarMetricMark(symbol: String, modifier: Modifier = Modifier) {
    StellarTitleMark(motif = when (symbol) {
        "📚", "📝", "📋", "📖" -> 2
        "🎯", "🚀", "⏱", "⏰" -> 3
        "✨", "🏆", "⭐", "🌟" -> 0
        else -> 1
    }, modifier = modifier)
}
