package com.keling.app.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.dp

enum class StellarArrowDirection(val degrees: Float) { Right(0f), Down(90f), Left(180f), Up(270f) }

/** The canonical right-pointing artwork is rotated without changing the control's touch target. */
@Composable
fun StellarArrow(
    modifier: Modifier = Modifier,
    direction: StellarArrowDirection = StellarArrowDirection.Right,
    description: String? = null
) {
    Box(modifier.size(40.dp).then(if (description == null) Modifier else Modifier.clearAndSetSemantics {
        contentDescription = description
    })) {
        StellarArt("navigation_arrow", null, Modifier.matchParentSize().rotate(direction.degrees))
    }
}

/** Wrap between complete sequence entries, retaining an explicit spoken traversal order. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun StellarSequence(label: String, values: List<String>, emptyText: String, modifier: Modifier = Modifier) {
    FlowRow(
        modifier.clearAndSetSemantics { contentDescription = "$label：${values.joinToString("，然后").ifBlank { emptyText }}" },
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Text("$label：")
        if (values.isEmpty()) Text(emptyText)
        values.forEachIndexed { index, value ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (index > 0) StellarArrow(Modifier.size(32.dp))
                Text(value)
            }
        }
    }
}
